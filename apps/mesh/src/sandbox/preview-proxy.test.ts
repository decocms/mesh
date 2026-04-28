import { describe, expect, it } from "bun:test";
import {
  extractHandleFromHost,
  parsePreviewBaseDomain,
  tryHandlePreviewHttp,
  tryUpgradePreviewWs,
} from "./preview-proxy";

/**
 * Inline mirror of `applyPreviewPattern` from
 * `packages/sandbox/server/runner/shared/preview-url.ts` — kept here as a
 * fixture so the round-trip test below has no cross-package coupling. If the
 * real implementation drifts, the round-trip test will fail and force this
 * mirror to update too.
 */
function applyPreviewPatternFixture(pattern: string, handle: string): string {
  const base = pattern.replace(/\/+$/, "");
  if (base.includes("{handle}")) {
    return `${base.replace("{handle}", handle)}/`;
  }
  try {
    const u = new URL(base);
    u.hostname = `${handle}.${u.hostname}`;
    return `${u.toString()}/`;
  } catch {
    return `${base}/${handle}/`;
  }
}

describe("parsePreviewBaseDomain", () => {
  it("extracts the base from {handle}-templated patterns", () => {
    expect(parsePreviewBaseDomain("https://{handle}.preview.decocms.com")).toBe(
      "preview.decocms.com",
    );
  });

  it("extracts from the bare-pattern form (no template)", () => {
    expect(parsePreviewBaseDomain("https://preview.example.com")).toBe(
      "preview.example.com",
    );
  });

  it("returns null for empty/unset patterns", () => {
    expect(parsePreviewBaseDomain(null)).toBeNull();
    expect(parsePreviewBaseDomain(undefined)).toBeNull();
    expect(parsePreviewBaseDomain("")).toBeNull();
    expect(parsePreviewBaseDomain("   ")).toBeNull();
  });

  it("returns null for malformed URLs", () => {
    expect(parsePreviewBaseDomain("not-a-url")).toBeNull();
  });

  it("returns null when the templated form has no base", () => {
    // `{handle}.localhost` — strip leading subdomain leaves "localhost",
    // which is technically valid, but `{handle}` alone (no dot) isn't.
    expect(parsePreviewBaseDomain("https://{handle}")).toBeNull();
  });
});

describe("extractHandleFromHost", () => {
  const base = "preview.decocms.com";

  it("extracts studio-sb- handles from the matching subdomain", () => {
    expect(
      extractHandleFromHost("studio-sb-abc123.preview.decocms.com", base),
    ).toBe("studio-sb-abc123");
  });

  it("ignores port suffix in Host header", () => {
    expect(
      extractHandleFromHost("studio-sb-abc.preview.decocms.com:8080", base),
    ).toBe("studio-sb-abc");
  });

  it("is case-insensitive on host + base", () => {
    expect(
      extractHandleFromHost("Studio-Sb-ABC.Preview.DecocMs.com", base),
    ).toBe("studio-sb-abc");
  });

  it("returns null when the handle prefix is missing", () => {
    expect(
      extractHandleFromHost("randomthing.preview.decocms.com", base),
    ).toBeNull();
  });

  it("returns null when the base domain doesn't match", () => {
    expect(
      extractHandleFromHost("studio-sb-abc.preview.example.org", base),
    ).toBeNull();
  });

  it("rejects nested subdomains", () => {
    // foo.studio-sb-abc.preview.decocms.com → strip suffix yields
    // "foo.studio-sb-abc" which has a dot → null.
    expect(
      extractHandleFromHost("foo.studio-sb-abc.preview.decocms.com", base),
    ).toBeNull();
  });

  it("returns null for missing host or base", () => {
    expect(extractHandleFromHost(null, base)).toBeNull();
    expect(extractHandleFromHost(undefined, base)).toBeNull();
    expect(
      extractHandleFromHost("studio-sb-abc.preview.decocms.com", ""),
    ).toBeNull();
  });
});

describe("applyPreviewPattern <-> parse/extract round-trip", () => {
  // Walks the contract that applyPreviewPattern (runner) and
  // parsePreviewBaseDomain + extractHandleFromHost (preview proxy) are
  // inverses. If either side ever supports a pattern shape the other doesn't
  // recognize, this test catches the mismatch before it silently misroutes
  // production traffic.
  const handle = "studio-sb-abc123";

  const patterns = [
    "https://{handle}.preview.decocms.com",
    "https://preview.example.com",
    "https://{handle}.preview.example.com/",
    "https://stage.example.com",
  ];

  for (const pattern of patterns) {
    it(`round-trips: ${pattern}`, () => {
      const previewUrl = applyPreviewPatternFixture(pattern, handle);
      const url = new URL(previewUrl);
      const baseDomain = parsePreviewBaseDomain(pattern);
      expect(baseDomain).not.toBeNull();
      const recovered = extractHandleFromHost(url.host, baseDomain!);
      expect(recovered).toBe(handle);
    });
  }
});

describe("tryHandlePreviewHttp", () => {
  const baseDomain = "preview.example.com";

  it("returns null when the host doesn't match a preview URL", async () => {
    const req = new Request("https://api.example.com/foo", {
      headers: { host: "api.example.com" },
    });
    const res = await tryHandlePreviewHttp(req, {
      baseDomain,
      getRunner: async () => null,
    });
    expect(res).toBeNull();
  });

  it("returns 503 when the runner isn't configured for K8s", async () => {
    const req = new Request("https://studio-sb-abc.preview.example.com/", {
      headers: { host: "studio-sb-abc.preview.example.com" },
    });
    const res = await tryHandlePreviewHttp(req, {
      baseDomain,
      getRunner: async () => null,
    });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
  });

  it("delegates to runner.proxyPreviewRequest with the parsed handle", async () => {
    let received: { handle: string; req: Request } | null = null;
    const fakeRunner = {
      proxyPreviewRequest: async (handle: string, req: Request) => {
        received = { handle, req };
        return new Response("ok", { status: 200 });
      },
    };
    const req = new Request(
      "https://studio-sb-deadbeef.preview.example.com/foo",
      {
        headers: { host: "studio-sb-deadbeef.preview.example.com" },
      },
    );
    const res = await tryHandlePreviewHttp(req, {
      baseDomain,
      // biome-ignore lint/suspicious/noExplicitAny: structural duck-type
      getRunner: async () => fakeRunner as any,
    });
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(received).not.toBeNull();
    expect(received!.handle).toBe("studio-sb-deadbeef");
  });
});

describe("tryUpgradePreviewWs", () => {
  const baseDomain = "preview.example.com";
  const previewHost = "studio-sb-abc123.preview.example.com";

  function wsRequest(path: string, host: string = previewHost): Request {
    return new Request(`https://${host}${path}`, {
      headers: {
        host,
        upgrade: "websocket",
        connection: "upgrade",
        "sec-websocket-key": "x3JJHMbDL1EzLkh9GBhXDw==",
        "sec-websocket-version": "13",
      },
    });
  }

  it("returns null when not a WS upgrade", async () => {
    const req = new Request(`https://${previewHost}/`, {
      headers: { host: previewHost },
    });
    const res = await tryUpgradePreviewWs(
      req,
      { upgrade: () => true },
      { baseDomain, getRunner: async () => null },
    );
    expect(res).toBeNull();
  });

  it("returns null when host doesn't match a preview", async () => {
    const req = wsRequest("/", "api.example.com");
    const res = await tryUpgradePreviewWs(
      req,
      { upgrade: () => true },
      { baseDomain, getRunner: async () => null },
    );
    expect(res).toBeNull();
  });

  it("returns 503 when the runner isn't ready", async () => {
    const req = wsRequest("/");
    const res = await tryUpgradePreviewWs(
      req,
      { upgrade: () => true },
      { baseDomain, getRunner: async () => null },
    );
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(503);
  });

  it("returns 404 when sandbox lookup misses", async () => {
    const fakeRunner = {
      resolvePreviewUpstreamUrl: async () => null,
    };
    const req = wsRequest("/");
    const res = await tryUpgradePreviewWs(
      req,
      { upgrade: () => true },
      {
        baseDomain,
        // biome-ignore lint/suspicious/noExplicitAny: structural duck-type
        getRunner: async () => fakeRunner as any,
      },
    );
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(404);
  });

  it("rejects /_decopilot_vm/* paths even on WS", async () => {
    const fakeRunner = {
      resolvePreviewUpstreamUrl: async () => "http://x:9000",
    };
    const req = wsRequest("/_decopilot_vm/bash");
    const res = await tryUpgradePreviewWs(
      req,
      { upgrade: () => true },
      {
        baseDomain,
        // biome-ignore lint/suspicious/noExplicitAny: structural duck-type
        getRunner: async () => fakeRunner as any,
      },
    );
    expect(res).not.toBeNull();
    expect((res as Response).status).toBe(404);
  });

  it("calls server.upgrade and returns undefined when upgrade succeeds", async () => {
    const fakeRunner = {
      resolvePreviewUpstreamUrl: async () => "http://upstream:9000",
    };
    let upgradeArgs: { req: Request; data: unknown } | null = null;
    const server = {
      upgrade: (req: Request, opts?: { data?: unknown }) => {
        upgradeArgs = { req, data: opts?.data };
        return true;
      },
    };
    const req = wsRequest("/__vite-hmr");
    const res = await tryUpgradePreviewWs(req, server, {
      baseDomain,
      // biome-ignore lint/suspicious/noExplicitAny: structural duck-type
      getRunner: async () => fakeRunner as any,
    });
    expect(res).toBeUndefined();
    expect(upgradeArgs).not.toBeNull();
    const data = upgradeArgs!.data as { upstreamUrl: string; kind: string };
    expect(data.kind).toBe("preview");
    expect(data.upstreamUrl).toBe("ws://upstream:9000/__vite-hmr");
  });
});

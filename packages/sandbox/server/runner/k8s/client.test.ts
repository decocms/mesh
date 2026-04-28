import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { K8S_CONSTANTS } from "./constants";
import {
  createSandboxClaim,
  deleteSandboxClaim,
  getSandboxClaim,
  patchSandboxClaimShutdown,
  type SandboxClaim,
  type SandboxResource,
  waitForSandboxReady,
} from "./client";

// ---- Minimal KubeConfig stub -----------------------------------------------
// client.ts only touches `getCurrentCluster` and `applyToHTTPSOptions`; the
// stub mirrors those and omits the 100-method surface of the real class.

const STUB_SERVER = "https://kube.test";

function makeKc(
  cluster: { server: string; skipTLSVerify?: boolean } = {
    server: STUB_SERVER,
  },
) {
  const apply = async (opts: Record<string, unknown>) => {
    opts.headers = { Authorization: "Bearer stub-token" };
    opts.cert = "STUB_CERT_PEM";
    opts.key = "STUB_KEY_PEM";
    opts.ca = "STUB_CA_PEM";
  };
  return {
    getCurrentCluster: () => cluster,
    applyToHTTPSOptions: apply,
  } as unknown as import("@kubernetes/client-node").KubeConfig;
}

// ---- Fetch interception ----------------------------------------------------
// Keep the real global fetch so test infra (bun itself) isn't affected, but
// swap it per-test with a stub that records calls + returns scripted responses.

type FetchCall = { url: string; init: RequestInit };
const fetchCalls: FetchCall[] = [];
let fetchImpl: (url: string, init: RequestInit) => Promise<Response> =
  async () => {
    throw new Error("no fetch impl set");
  };
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchCalls.length = 0;
  globalThis.fetch = mock(async (url: URL | string, init: RequestInit = {}) => {
    const record: FetchCall = {
      url: typeof url === "string" ? url : url.toString(),
      init,
    };
    fetchCalls.push(record);
    return fetchImpl(record.url, init);
  }) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---- Response helpers -------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Build a response whose body is a push-driven ND-JSON stream. */
function ndJsonResponse(status: number): {
  resp: Response;
  push: (obj: unknown) => void;
  close: () => void;
} {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start: (c) => {
      controller = c;
    },
  });
  const encoder = new TextEncoder();
  return {
    resp: new Response(stream, {
      status,
      headers: { "content-type": "application/json" },
    }),
    push: (obj) =>
      controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`)),
    close: () => controller.close(),
  };
}

// ---- Fixtures ---------------------------------------------------------------

const NS = "agent-sandbox-system";

function makeClaim(name: string): SandboxClaim {
  return {
    apiVersion: `${K8S_CONSTANTS.CLAIM_API_GROUP}/${K8S_CONSTANTS.CLAIM_API_VERSION}`,
    kind: "SandboxClaim",
    metadata: { name, namespace: NS },
    spec: {
      sandboxTemplateRef: { name: "mesh-sandbox" },
      lifecycle: { shutdownPolicy: "Delete" },
    },
  };
}

// ----------------------------------------------------------------------------

describe("createSandboxClaim", () => {
  it("POSTs the claim body verbatim to the plural endpoint", async () => {
    fetchImpl = async () => jsonResponse(201, { kind: "SandboxClaim" });
    const claim = makeClaim("mesh-sb-abc");
    await createSandboxClaim(makeKc(), NS, claim);

    expect(fetchCalls).toHaveLength(1);
    const [call] = fetchCalls;
    expect(call!.url).toBe(
      `${STUB_SERVER}/apis/${K8S_CONSTANTS.CLAIM_API_GROUP}/${K8S_CONSTANTS.CLAIM_API_VERSION}/namespaces/${NS}/${K8S_CONSTANTS.CLAIM_PLURAL}`,
    );
    expect(call!.init.method).toBe("POST");
    expect(JSON.parse(String(call!.init.body))).toEqual(claim);
    // Auth header flows through from applyToHTTPSOptions.
    const headers = call!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer stub-token");
  });

  it("round-trips spec.env + warmpool (per-claim DAEMON_TOKEN shape)", async () => {
    // Stage 2.1 claim shape: per-claim env requires warmpool: "none".
    // Lock the exact wire payload so a bad serializer regression (dropping
    // env, mangling warmpool) surfaces in unit tests — before it wastes a
    // kind-cluster provision cycle discovering the same bug.
    fetchImpl = async () => jsonResponse(201, { kind: "SandboxClaim" });
    const claim: SandboxClaim = {
      apiVersion: `${K8S_CONSTANTS.CLAIM_API_GROUP}/${K8S_CONSTANTS.CLAIM_API_VERSION}`,
      kind: "SandboxClaim",
      metadata: { name: "mesh-sb-tok", namespace: NS },
      spec: {
        sandboxTemplateRef: { name: "mesh-sandbox" },
        env: [{ name: "DAEMON_TOKEN", value: "abc123" }],
        warmpool: "none",
        lifecycle: { shutdownPolicy: "Delete" },
      },
    };
    await createSandboxClaim(makeKc(), NS, claim);
    const body = JSON.parse(String(fetchCalls[0]!.init.body));
    expect(body.spec.env).toEqual([{ name: "DAEMON_TOKEN", value: "abc123" }]);
    expect(body.spec.warmpool).toBe("none");
  });

  it("wraps non-2xx errors in SandboxError with the claim name", async () => {
    fetchImpl = async () =>
      jsonResponse(409, {
        kind: "Status",
        status: "Failure",
        reason: "AlreadyExists",
        message: "already exists",
        code: 409,
      });
    await expect(
      createSandboxClaim(makeKc(), NS, makeClaim("dup")),
    ).rejects.toThrow(/Failed to create SandboxClaim: dup/);
  });
});

describe("deleteSandboxClaim", () => {
  it("swallows 404 silently (idempotent delete)", async () => {
    fetchImpl = async () =>
      jsonResponse(404, {
        kind: "Status",
        reason: "NotFound",
        message: "not found",
      });
    await expect(
      deleteSandboxClaim(makeKc(), NS, "gone"),
    ).resolves.toBeUndefined();
    expect(fetchCalls[0]!.init.method).toBe("DELETE");
  });

  it("re-throws non-404 errors wrapped in SandboxError", async () => {
    fetchImpl = async () =>
      jsonResponse(403, {
        kind: "Status",
        reason: "Forbidden",
        message: "forbidden",
      });
    await expect(deleteSandboxClaim(makeKc(), NS, "x")).rejects.toThrow(
      /Failed to delete SandboxClaim: x/,
    );
  });
});

describe("getSandboxClaim", () => {
  it("returns undefined on 404", async () => {
    fetchImpl = async () =>
      jsonResponse(404, {
        kind: "Status",
        reason: "NotFound",
        message: "not found",
      });
    const result = await getSandboxClaim(makeKc(), NS, "missing");
    expect(result).toBeUndefined();
  });

  it("returns the resource body on 200", async () => {
    const body: SandboxResource = {
      metadata: { name: "present" },
      status: { conditions: [{ type: "Ready", status: "False" }] },
    };
    fetchImpl = async () => jsonResponse(200, body);
    const result = await getSandboxClaim(makeKc(), NS, "present");
    expect(result).toEqual(body);
  });

  it("URL-encodes the claim name", async () => {
    fetchImpl = async () => jsonResponse(404, null);
    await getSandboxClaim(makeKc(), NS, "weird/name");
    expect(fetchCalls[0]!.url).toContain("/weird%2Fname");
  });
});

describe("patchSandboxClaimShutdown", () => {
  it("sends merge-patch with lifecycle.shutdownTime only", async () => {
    fetchImpl = async () => jsonResponse(200, { kind: "SandboxClaim" });
    await patchSandboxClaimShutdown(
      makeKc(),
      NS,
      "mesh-sb-x",
      "2026-04-01T12:00:00.000Z",
    );
    expect(fetchCalls).toHaveLength(1);
    const [call] = fetchCalls;
    expect(call!.init.method).toBe("PATCH");
    const headers = call!.init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/merge-patch+json");
    expect(JSON.parse(String(call!.init.body))).toEqual({
      spec: {
        lifecycle: {
          shutdownPolicy: "Delete",
          shutdownTime: "2026-04-01T12:00:00.000Z",
        },
      },
    });
  });

  it("swallows 404 silently (claim deleted between lookup and patch)", async () => {
    fetchImpl = async () =>
      jsonResponse(404, {
        kind: "Status",
        reason: "NotFound",
        message: "not found",
      });
    await expect(
      patchSandboxClaimShutdown(
        makeKc(),
        NS,
        "gone",
        "2026-04-01T12:00:00.000Z",
      ),
    ).resolves.toBeUndefined();
  });

  it("wraps other errors in SandboxError", async () => {
    fetchImpl = async () =>
      jsonResponse(409, {
        kind: "Status",
        reason: "Conflict",
        message: "conflict",
      });
    await expect(
      patchSandboxClaimShutdown(
        makeKc(),
        NS,
        "busy",
        "2026-04-01T12:00:00.000Z",
      ),
    ).rejects.toThrow(/Failed to patch SandboxClaim shutdownTime: busy/);
  });
});

describe("waitForSandboxReady", () => {
  it("resolves with sandboxName + podName once Ready=True is observed", async () => {
    const stream = ndJsonResponse(200);
    fetchImpl = async () => stream.resp;
    const p = waitForSandboxReady(makeKc(), NS, "claim-xyz", 60);
    stream.push({
      type: "MODIFIED",
      object: {
        metadata: {
          name: "claim-xyz",
          annotations: { [K8S_CONSTANTS.POD_NAME_ANNOTATION]: "pod-42" },
        },
        status: { conditions: [{ type: "Ready", status: "True" }] },
      },
    });
    await expect(p).resolves.toEqual({
      sandboxName: "claim-xyz",
      podName: "pod-42",
    });
    const url = fetchCalls[0]!.url;
    expect(url).toContain("?watch=true");
    expect(url).toContain("fieldSelector=");
  });

  it("falls back to sandboxName when pod-name annotation is absent", async () => {
    const stream = ndJsonResponse(200);
    fetchImpl = async () => stream.resp;
    const p = waitForSandboxReady(makeKc(), NS, "claim-xyz", 60);
    stream.push({
      type: "MODIFIED",
      object: {
        metadata: { name: "claim-xyz" },
        status: { conditions: [{ type: "Ready", status: "True" }] },
      },
    });
    await expect(p).resolves.toEqual({
      sandboxName: "claim-xyz",
      podName: "claim-xyz",
    });
  });

  it("ignores non-Ready conditions and keeps watching", async () => {
    const stream = ndJsonResponse(200);
    fetchImpl = async () => stream.resp;
    const p = waitForSandboxReady(makeKc(), NS, "claim-xyz", 60);
    // Emit a non-Ready condition — should not settle.
    stream.push({
      type: "MODIFIED",
      object: {
        metadata: { name: "claim-xyz" },
        status: { conditions: [{ type: "Progressing", status: "True" }] },
      },
    });
    const sentinel = Symbol("still-pending");
    const winner = await Promise.race([
      p,
      new Promise((r) => setTimeout(() => r(sentinel), 10)),
    ]);
    expect(winner).toBe(sentinel);

    stream.push({
      type: "MODIFIED",
      object: {
        metadata: { name: "claim-xyz" },
        status: { conditions: [{ type: "Ready", status: "True" }] },
      },
    });
    await expect(p).resolves.toEqual({
      sandboxName: "claim-xyz",
      podName: "claim-xyz",
    });
  });

  it("rejects with SandboxTimeoutError after the deadline", async () => {
    // Server accepts the connection but never emits — simulate a watch that
    // just hangs. 0-second timeout fires on the next tick.
    const stream = ndJsonResponse(200);
    fetchImpl = async () => stream.resp;
    const p = waitForSandboxReady(makeKc(), NS, "claim-xyz", 0);
    await expect(p).rejects.toThrow(/did not become ready within 0 seconds/);
  });

  it("rejects if the watch handshake itself fails", async () => {
    fetchImpl = async () => {
      throw new Error("kube-apiserver unreachable");
    };
    const p = waitForSandboxReady(makeKc(), NS, "claim-xyz", 60);
    await expect(p).rejects.toThrow(
      /Failed to start watch for sandbox readiness/,
    );
  });

  it("rejects when the Sandbox object has no metadata.name", async () => {
    const stream = ndJsonResponse(200);
    fetchImpl = async () => stream.resp;
    const p = waitForSandboxReady(makeKc(), NS, "claim-xyz", 60);
    stream.push({
      type: "MODIFIED",
      object: {
        // no metadata.name
        status: { conditions: [{ type: "Ready", status: "True" }] },
      },
    });
    await expect(p).rejects.toThrow(/Sandbox metadata or name is missing/);
  });

  it("rejects on ERROR frames from the watch stream", async () => {
    const stream = ndJsonResponse(200);
    fetchImpl = async () => stream.resp;
    const p = waitForSandboxReady(makeKc(), NS, "claim-xyz", 60);
    stream.push({
      type: "ERROR",
      object: {
        kind: "Status",
        status: "Failure",
        reason: "Expired",
        message: "watch channel expired",
      },
    });
    await expect(p).rejects.toThrow(
      /Watch stream error while waiting for sandbox: watch channel expired/,
    );
  });
});

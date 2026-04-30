import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { AgentSandboxRunner } from "./runner";
import type { SandboxResource } from "./client";

const STUB_SERVER = "https://kube.test";
const NS = "agent-sandbox-system";
const PREVIEW_PATTERN = "https://{handle}.preview.example.com";

function makeKc() {
  const apply = async (opts: Record<string, unknown>) => {
    opts.headers = { Authorization: "Bearer stub-token" };
    opts.cert = "STUB";
    opts.key = "STUB";
    opts.ca = "STUB";
  };
  return {
    getCurrentCluster: () => ({ server: STUB_SERVER }),
    applyToHTTPSOptions: apply,
  } as unknown as import("@kubernetes/client-node").KubeConfig;
}

function readyClaim(name: string): SandboxResource {
  return {
    metadata: { name, labels: { "app.kubernetes.io/managed-by": "studio" } },
    status: { conditions: [{ type: "Ready", status: "True" }] },
  };
}

function notReadyClaim(name: string): SandboxResource {
  return {
    metadata: { name },
    status: { conditions: [{ type: "Ready", status: "False" }] },
  };
}

type Call = { url: string; method: string; body?: string };

let calls: Call[] = [];
let responder: (call: Call) => Response = () =>
  new Response("unhandled", { status: 500 });
const originalFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  globalThis.fetch = mock(async (url: URL | string, init: RequestInit = {}) => {
    const call: Call = {
      url: typeof url === "string" ? url : url.toString(),
      method: init.method ?? "GET",
      body: init.body == null ? undefined : String(init.body),
    };
    calls.push(call);
    return responder(call);
  }) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function newRunner() {
  return new AgentSandboxRunner({
    kubeConfig: makeKc(),
    namespace: NS,
    idleTtlMs: 60_000,
    previewUrlPattern: PREVIEW_PATTERN,
    idleSweepEnabled: false,
    inClusterDaemonAccess: true,
  });
}

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("AgentSandboxRunner idle sweep", () => {
  it("patches shutdownTime for each ready+active claim", async () => {
    const runner = newRunner();
    try {
      responder = (call) => {
        if (call.url.includes("/sandboxclaims") && call.method === "GET") {
          return jsonResp(200, {
            items: [readyClaim("studio-sb-a"), readyClaim("studio-sb-b")],
          });
        }
        if (call.url.endsWith("/_decopilot_vm/idle")) {
          return jsonResp(200, {
            lastActivityAt: new Date().toISOString(),
            idleMs: 5_000,
          });
        }
        if (call.method === "PATCH") return jsonResp(200, {});
        return new Response("unhandled", { status: 500 });
      };

      await runner.runIdleSweepOnce();

      const patches = calls.filter((c) => c.method === "PATCH");
      expect(patches.length).toBe(2);
      const patchedNames = patches.map((p) => {
        const m = p.url.match(/\/sandboxclaims\/([^/?]+)/);
        return m?.[1];
      });
      expect(patchedNames.sort()).toEqual(["studio-sb-a", "studio-sb-b"]);
      for (const p of patches) {
        const body = JSON.parse(p.body ?? "{}");
        expect(body.spec.lifecycle.shutdownPolicy).toBe("Delete");
        expect(typeof body.spec.lifecycle.shutdownTime).toBe("string");
      }
    } finally {
      runner.close();
    }
  });

  it("skips claims past the idle threshold (operator reaps them)", async () => {
    const runner = newRunner();
    try {
      responder = (call) => {
        if (call.url.includes("/sandboxclaims") && call.method === "GET") {
          return jsonResp(200, { items: [readyClaim("studio-sb-stale")] });
        }
        if (call.url.endsWith("/_decopilot_vm/idle")) {
          return jsonResp(200, {
            lastActivityAt: "2026-01-01T00:00:00.000Z",
            idleMs: 999_999_999,
          });
        }
        if (call.method === "PATCH") return jsonResp(200, {});
        return new Response("unhandled", { status: 500 });
      };

      await runner.runIdleSweepOnce();
      expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    } finally {
      runner.close();
    }
  });

  it("skips not-ready claims", async () => {
    const runner = newRunner();
    try {
      responder = (call) => {
        if (call.url.includes("/sandboxclaims") && call.method === "GET") {
          return jsonResp(200, { items: [notReadyClaim("studio-sb-pending")] });
        }
        return new Response("unhandled", { status: 500 });
      };
      await runner.runIdleSweepOnce();
      expect(calls.some((c) => c.url.endsWith("/_decopilot_vm/idle"))).toBe(
        false,
      );
      expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    } finally {
      runner.close();
    }
  });

  it("tolerates unreachable daemons (no patch, no throw)", async () => {
    const runner = newRunner();
    try {
      responder = (call) => {
        if (call.url.includes("/sandboxclaims") && call.method === "GET") {
          return jsonResp(200, { items: [readyClaim("studio-sb-down")] });
        }
        if (call.url.endsWith("/_decopilot_vm/idle")) {
          throw new Error("ECONNREFUSED");
        }
        return new Response("unhandled", { status: 500 });
      };
      await expect(runner.runIdleSweepOnce()).resolves.toBeUndefined();
      expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    } finally {
      runner.close();
    }
  });

  it("tolerates list failures (no claims processed, no throw)", async () => {
    const runner = newRunner();
    try {
      responder = (call) => {
        if (call.url.includes("/sandboxclaims") && call.method === "GET") {
          return jsonResp(500, { message: "server error" });
        }
        return new Response("unhandled", { status: 500 });
      };
      await expect(runner.runIdleSweepOnce()).resolves.toBeUndefined();
      expect(calls.some((c) => c.url.endsWith("/_decopilot_vm/idle"))).toBe(
        false,
      );
    } finally {
      runner.close();
    }
  });

  it("after close(), runIdleSweepOnce is a no-op", async () => {
    const runner = newRunner();
    runner.close();
    await runner.runIdleSweepOnce();
    expect(calls).toHaveLength(0);
  });
});

/**
 * Phase 2 (daemon-bootstrap) tests for the agent-sandbox runner.
 *
 * Strategy: intercept `globalThis.fetch` so the runner's K8s client and
 * daemon-client modules both go through a single in-memory router. No
 * `mock.module` (which leaks across test files in Bun's runner). The
 * runner's port-forward layer is patched on the instance directly.
 *
 * Coverage:
 *  - `buildClaim`: empty `spec.env`, `decocms.io/claim-nonce` annotation
 *      populated, no `warmpool` field.
 *  - `buildBootstrapPayload`: schemaVersion=1, claimNonce matches the
 *      one stamped on the claim, every input field surfaces.
 *  - tx1 + tx2 interleaved persistence (single-statement upserts).
 *  - Partial-commit recovery: state-store row with tx1 fields but no
 *      `bootstrappedAt` triggers re-bootstrap on the next ensure().
 *  - Phase decision matrix: `pending-bootstrap` (re-bootstrap),
 *      `bootstrapping` (wait), `ready` (no-op), `failed` (delete +
 *      recurse).
 *  - Legacy adopt (claim exists, no state-store row) → null + recreate.
 *  - Two-replica race: deterministic claim name → loser falls into
 *      rehydrate, no second `createSandboxClaim` call.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { AgentSandboxRunner, composeClaimName } from "./runner";
import { K8S_CONSTANTS } from "./constants";
import type { KubeConfig } from "@kubernetes/client-node";
import type {
  RunnerStateRecord,
  RunnerStateRecordWithId,
  RunnerStatePut,
  RunnerStateStore,
  RunnerStateStoreOps,
} from "../state-store";
import type { SandboxId } from "../types";

// ---------------------------------------------------------------------------
// In-memory cluster + daemon state. The fetch router below reads from this
// each call so tests can flip phases / claim presence between operations.
// ---------------------------------------------------------------------------

interface ClaimEntry {
  resource: SandboxResourceShape;
}

interface SandboxResourceShape {
  metadata?: {
    name?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  status?: { conditions?: Array<{ type: string; status: string }> };
  spec?: unknown;
}

interface BootstrapPayload {
  schemaVersion: 1;
  claimNonce: string;
  daemonToken: string;
  runtime: string;
  cloneUrl?: string;
  repoName?: string;
  branch?: string;
  gitUserName?: string;
  gitUserEmail?: string;
  packageManager?: string;
  devPort?: number;
  appRoot?: string;
  env?: Record<string, string>;
}

interface ClaimShape {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: {
    sandboxTemplateRef: { name: string };
    env?: Array<{ name: string; value: string }>;
    additionalPodMetadata?: {
      labels?: Record<string, string>;
      annotations?: Record<string, string>;
    };
    warmpool?: string;
    lifecycle?: { shutdownPolicy?: string; shutdownTime?: string };
  };
}

const fakeState: {
  claims: Map<string, ClaimEntry>;
  daemonPhase: "pending-bootstrap" | "bootstrapping" | "ready" | "failed";
  bootstrapResponse: {
    phase: "ready" | "bootstrapping";
    bootId: string;
    hash: string;
  };
  bootstrapCalls: BootstrapPayload[];
  callCounts: { create: number; delete: number };
  lastClaim: ClaimShape | null;
  // Hook fired right after a delete fakeState observes; tests use it to
  // flip phases mid-flow without messing with timers.
  onAfterDelete: ((handle: string) => void) | null;
} = {
  claims: new Map(),
  daemonPhase: "ready",
  bootstrapResponse: { phase: "ready", bootId: "boot-test", hash: "hash-1" },
  bootstrapCalls: [],
  callCounts: { create: 0, delete: 0 },
  lastClaim: null,
  onAfterDelete: null,
};

function resetFakeState() {
  fakeState.claims.clear();
  fakeState.daemonPhase = "ready";
  fakeState.bootstrapResponse = {
    phase: "ready",
    bootId: "boot-test",
    hash: "hash-1",
  };
  fakeState.bootstrapCalls.length = 0;
  fakeState.callCounts = { create: 0, delete: 0 };
  fakeState.lastClaim = null;
  fakeState.onAfterDelete = null;
}

// ---------------------------------------------------------------------------
// fetch router: interprets K8s API paths + daemon ports.
// ---------------------------------------------------------------------------

const CLAIM_PREFIX = `/apis/${K8S_CONSTANTS.CLAIM_API_GROUP}/${K8S_CONSTANTS.CLAIM_API_VERSION}/namespaces/`;

function jsonResp(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeFetchRouter() {
  return async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const u = new URL(url);

    // Daemon port (any 127.0.0.1:<port> we synthesized via patchForwarder
    // is fine — the runner doesn't validate the host).
    if (u.hostname === "127.0.0.1") {
      if (u.pathname === "/health") {
        return jsonResp(200, {
          ready: fakeState.daemonPhase === "ready",
          bootId: "boot-test",
          setup: { running: false, done: fakeState.daemonPhase === "ready" },
          phase: fakeState.daemonPhase,
        });
      }
      if (u.pathname === "/_decopilot_vm/bootstrap" && method === "POST") {
        // Mesh base64-encodes the JSON body to match the daemon's
        // parseBase64JsonBody contract; decode before parsing.
        const b64 = String(init?.body ?? "");
        const raw = b64 ? Buffer.from(b64, "base64").toString("utf-8") : "{}";
        const payload = JSON.parse(raw) as BootstrapPayload;
        fakeState.bootstrapCalls.push(payload);
        return jsonResp(200, fakeState.bootstrapResponse);
      }
      return new Response("not found", { status: 404 });
    }

    // K8s API: only the SandboxClaim CRUD + waitForSandboxReady watch
    // matter for these tests.
    if (u.pathname.startsWith(CLAIM_PREFIX)) {
      // /apis/.../namespaces/<ns>/sandboxclaims  → POST create / GET watch
      // /apis/.../namespaces/<ns>/sandboxclaims/<name> → GET / DELETE / PATCH
      const parts = u.pathname.slice(CLAIM_PREFIX.length).split("/");
      const claimsIdx = parts.indexOf(K8S_CONSTANTS.CLAIM_PLURAL);
      const claimName = parts[claimsIdx + 1] ?? null;

      if (claimName === null) {
        if (method === "POST") {
          const claim = JSON.parse(String(init?.body ?? "{}")) as ClaimShape;
          if (fakeState.claims.has(claim.metadata.name)) {
            return jsonResp(409, {
              kind: "Status",
              status: "Failure",
              reason: "AlreadyExists",
              message: `claim ${claim.metadata.name} already exists`,
            });
          }
          fakeState.claims.set(claim.metadata.name, {
            resource: {
              metadata: {
                name: claim.metadata.name,
                labels: claim.metadata.labels,
                annotations: claim.metadata.annotations,
              },
              status: { conditions: [{ type: "Ready", status: "True" }] },
              spec: claim.spec,
            },
          });
          fakeState.callCounts.create += 1;
          fakeState.lastClaim = claim;
          return jsonResp(201, claim);
        }
      } else {
        if (method === "GET" && !u.searchParams.has("watch")) {
          const entry = fakeState.claims.get(claimName);
          if (!entry) return jsonResp(404, { kind: "Status" });
          return jsonResp(200, entry.resource);
        }
        if (method === "DELETE") {
          fakeState.claims.delete(claimName);
          fakeState.callCounts.delete += 1;
          fakeState.onAfterDelete?.(claimName);
          return jsonResp(200, {});
        }
        if (method === "PATCH") {
          // patchSandboxClaimShutdown: no-op for these tests.
          return jsonResp(200, {});
        }
      }
    }

    // Sandbox watch (waitForSandboxReady): emit a single Ready=True event
    // and close the stream.
    if (
      u.pathname.includes(K8S_CONSTANTS.SANDBOX_PLURAL) &&
      u.searchParams.get("watch") === "true"
    ) {
      const fieldSel = u.searchParams.get("fieldSelector") ?? "";
      const m = fieldSel.match(/metadata\.name=([^,]+)/);
      const name = m?.[1] ?? "unknown";
      const stream = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(
            new TextEncoder().encode(
              `${JSON.stringify({
                type: "ADDED",
                object: {
                  metadata: {
                    name,
                    annotations: {
                      [K8S_CONSTANTS.POD_NAME_ANNOTATION]: name,
                    },
                  },
                  status: { conditions: [{ type: "Ready", status: "True" }] },
                },
              })}\n`,
            ),
          );
          c.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // SSA Service port patch + HTTPRoute create — no-op (the runner only
    // calls these when previewGateway is set; tests don't set it).
    return jsonResp(200, {});
  };
}

let origFetch: typeof globalThis.fetch | null = null;

beforeEach(() => {
  resetFakeState();
  origFetch = globalThis.fetch;
  globalThis.fetch = makeFetchRouter() as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  if (origFetch) globalThis.fetch = origFetch;
  resetFakeState();
});

// ---------------------------------------------------------------------------
// In-memory state store.
// ---------------------------------------------------------------------------

function makeStore(): RunnerStateStore & {
  putCalls: Array<{ id: SandboxId; entry: RunnerStatePut }>;
} {
  const byId = new Map<string, RunnerStateRecordWithId>();
  const byHandle = new Map<string, RunnerStateRecordWithId>();
  const putCalls: Array<{ id: SandboxId; entry: RunnerStatePut }> = [];
  const k = (id: SandboxId, kind: string) =>
    `${id.userId}:${id.projectRef}:${kind}`;
  const ops: RunnerStateStoreOps = {
    async get(id, kind): Promise<RunnerStateRecord | null> {
      return byId.get(k(id, kind)) ?? null;
    },
    async getByHandle(kind, handle) {
      return byHandle.get(`${kind}:${handle}`) ?? null;
    },
    async put(id, kind, entry) {
      putCalls.push({ id, entry });
      const rec: RunnerStateRecordWithId = {
        id,
        handle: entry.handle,
        state: entry.state,
        updatedAt: new Date(),
      };
      byId.set(k(id, kind), rec);
      byHandle.set(`${kind}:${entry.handle}`, rec);
    },
    async delete(id, kind) {
      const rec = byId.get(k(id, kind));
      byId.delete(k(id, kind));
      if (rec) byHandle.delete(`${kind}:${rec.handle}`);
    },
    async deleteByHandle(kind, handle) {
      const rec = byHandle.get(`${kind}:${handle}`);
      byHandle.delete(`${kind}:${handle}`);
      if (rec) byId.delete(k(rec.id, "agent-sandbox"));
    },
  };
  return Object.assign(ops, {
    putCalls,
    async withLock<T>(
      _id: SandboxId,
      _kind: string,
      fn: (s: RunnerStateStoreOps) => Promise<T>,
    ): Promise<T> {
      return fn(ops);
    },
  });
}

// ---------------------------------------------------------------------------
// Stub the kubeconfig + port-forward path. The runner only uses kc to thread
// through to kubeFetch (which we intercept). openForwarder is replaced on
// the instance so we don't need a real WebSocket tunnel.
// ---------------------------------------------------------------------------

const KC: KubeConfig = {
  getCurrentCluster: () => ({
    server: "https://kube.test",
    skipTLSVerify: true,
  }),
  applyToHTTPSOptions: async () => {},
} as unknown as KubeConfig;

let nextPort = 41000;

function patchForwarder<T extends InstanceType<typeof AgentSandboxRunner>>(
  runner: T,
): T {
  const r = runner;
  (r as any).openForwarder = async () => ({
    server: {
      close: (cb?: () => void) => cb?.(),
      address: () => ({ port: nextPort }),
    },
    localPort: nextPort++,
  });
  (r as any).closeForwarder = () => {};
  return runner;
}

const ID: SandboxId = { userId: "u_1", projectRef: "agent:o:v:main" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildClaim — Phase 2 shape", () => {
  it("emits empty spec.env, claim-nonce annotation, no warmpool field", async () => {
    const store = makeStore();
    const runner = patchForwarder(
      new AgentSandboxRunner({
        kubeConfig: KC,
        stateStore: store,
        tokenGenerator: () => "tok-fixed",
      }),
    );
    await runner.ensure(ID, {
      repo: {
        cloneUrl: "https://example.com/r.git",
        userName: "Alice",
        userEmail: "alice@example.com",
        branch: "main",
      },
    });
    const lastClaim = fakeState.lastClaim!;
    expect(lastClaim).toBeDefined();
    expect(lastClaim.spec.env ?? []).toHaveLength(0);
    expect("warmpool" in lastClaim.spec).toBe(false);
    expect(
      lastClaim.spec.additionalPodMetadata?.annotations?.[
        "decocms.io/claim-nonce"
      ],
    ).toMatch(/^[0-9a-f]{64}$/);
    expect(lastClaim.apiVersion).toBe(
      `${K8S_CONSTANTS.CLAIM_API_GROUP}/${K8S_CONSTANTS.CLAIM_API_VERSION}`,
    );
  });
});

describe("buildBootstrapPayload — round-trip", () => {
  it("schemaVersion=1, claimNonce echoed, every field surfaces", async () => {
    const store = makeStore();
    const runner = patchForwarder(
      new AgentSandboxRunner({
        kubeConfig: KC,
        stateStore: store,
        tokenGenerator: () => "tok-fixed",
      }),
    );
    await runner.ensure(ID, {
      repo: {
        cloneUrl: "https://example.com/repo.git",
        userName: "Alice",
        userEmail: "alice@example.com",
        branch: "feature/x",
        displayName: "my-repo",
      },
      workload: { runtime: "bun", packageManager: "bun", devPort: 5173 },
      env: { FOO: "bar" },
    });
    expect(fakeState.bootstrapCalls).toHaveLength(1);
    const payload = fakeState.bootstrapCalls[0]!;
    expect(payload.schemaVersion).toBe(1);
    expect(payload.daemonToken).toBe("tok-fixed");
    expect(payload.runtime).toBe("bun");
    expect(payload.packageManager).toBe("bun");
    expect(payload.devPort).toBe(5173);
    expect(payload.cloneUrl).toBe("https://example.com/repo.git");
    expect(payload.repoName).toBe("my-repo");
    expect(payload.branch).toBe("feature/x");
    expect(payload.gitUserName).toBe("Alice");
    expect(payload.gitUserEmail).toBe("alice@example.com");
    expect(payload.appRoot).toBe("/app");
    expect(payload.env).toEqual({ FOO: "bar" });
    const lastClaim = fakeState.lastClaim!;
    expect(payload.claimNonce).toBe(
      lastClaim.spec.additionalPodMetadata!.annotations![
        "decocms.io/claim-nonce"
      ],
    );
  });
});

describe("provision — persistence", () => {
  it("persists tx1 (no bootstrappedAt) before tx2 (with bootstrappedAt)", async () => {
    const store = makeStore();
    const runner = patchForwarder(
      new AgentSandboxRunner({
        kubeConfig: KC,
        stateStore: store,
        tokenGenerator: () => "tok",
      }),
    );
    await runner.ensure(ID);
    expect(store.putCalls.length).toBeGreaterThanOrEqual(2);
    const tx1 = store.putCalls[0]!;
    expect(tx1.entry.state.bootstrappedAt).toBeUndefined();
    expect(tx1.entry.state.claimNonce).toMatch(/^[0-9a-f]{64}$/);
    const tx2 = store.putCalls[store.putCalls.length - 1]!;
    expect(tx2.entry.state.bootstrappedAt).toBeDefined();
    expect(tx2.entry.state.bootstrapHash).toBe("hash-1");
  });

  it("partial-commit recovery: tx1 persisted, tx2 missing → next ensure re-bootstraps", async () => {
    const store = makeStore();
    const handle = composeClaimName(ID, null);
    const stagedNonce = "stagednonce".padEnd(64, "0");
    await store.put(ID, "agent-sandbox", {
      handle,
      state: {
        podName: handle,
        token: "tok-stable",
        workdir: "/app",
        ensureOpts: {},
        claimNonce: stagedNonce,
      },
    });
    fakeState.claims.set(handle, {
      resource: {
        metadata: { name: handle },
        status: { conditions: [{ type: "Ready", status: "True" }] },
      },
    });
    fakeState.daemonPhase = "pending-bootstrap";
    const runner = patchForwarder(
      new AgentSandboxRunner({
        kubeConfig: KC,
        stateStore: store,
        tokenGenerator: () => "would-not-match-rehydrate",
      }),
    );
    // After the rehydrate-time bootstrap call, mark the daemon ready so
    // waitForDaemonReady (called immediately after) terminates.
    const router = makeFetchRouter();
    globalThis.fetch = (async (input, init) => {
      const u =
        typeof input === "string" ? new URL(input) : new URL(input.toString());
      if (
        u.hostname === "127.0.0.1" &&
        u.pathname === "/_decopilot_vm/bootstrap"
      ) {
        const resp = await router(input, init);
        fakeState.daemonPhase = "ready";
        return resp;
      }
      return router(input, init);
    }) as unknown as typeof globalThis.fetch;
    await runner.ensure(ID);
    expect(fakeState.bootstrapCalls).toHaveLength(1);
    expect(fakeState.bootstrapCalls[0]!.claimNonce).toBe(stagedNonce);
    expect(fakeState.bootstrapCalls[0]!.daemonToken).toBe("tok-stable");
    expect(fakeState.callCounts.create).toBe(0);
  });
});

describe("rehydrate — phase decision matrix", () => {
  it("phase=ready: no bootstrap call", async () => {
    const store = makeStore();
    const handle = composeClaimName(ID, null);
    await store.put(ID, "agent-sandbox", {
      handle,
      state: {
        podName: handle,
        token: "tok",
        workdir: "/app",
        ensureOpts: {},
        claimNonce: "n".padEnd(64, "0"),
        bootstrappedAt: new Date().toISOString(),
        bootstrapHash: "old-hash",
      },
    });
    fakeState.claims.set(handle, {
      resource: {
        metadata: { name: handle },
        status: { conditions: [{ type: "Ready", status: "True" }] },
      },
    });
    fakeState.daemonPhase = "ready";
    const runner = patchForwarder(
      new AgentSandboxRunner({ kubeConfig: KC, stateStore: store }),
    );
    await runner.ensure(ID);
    expect(fakeState.bootstrapCalls).toHaveLength(0);
  });

  it("phase=pending-bootstrap: re-issues bootstrap with persisted state", async () => {
    const store = makeStore();
    const handle = composeClaimName(ID, null);
    const nonce = "nonce".padEnd(64, "0");
    await store.put(ID, "agent-sandbox", {
      handle,
      state: {
        podName: handle,
        token: "tok-rehydrate",
        workdir: "/app",
        ensureOpts: {
          repo: {
            cloneUrl: "https://x.test/r.git",
            userName: "u",
            userEmail: "u@x.test",
          },
        },
        claimNonce: nonce,
      },
    });
    fakeState.claims.set(handle, {
      resource: {
        metadata: { name: handle },
        status: { conditions: [{ type: "Ready", status: "True" }] },
      },
    });
    fakeState.daemonPhase = "pending-bootstrap";
    const router = makeFetchRouter();
    globalThis.fetch = (async (input, init) => {
      const u =
        typeof input === "string" ? new URL(input) : new URL(input.toString());
      if (
        u.hostname === "127.0.0.1" &&
        u.pathname === "/_decopilot_vm/bootstrap"
      ) {
        const resp = await router(input, init);
        fakeState.daemonPhase = "ready";
        return resp;
      }
      return router(input, init);
    }) as unknown as typeof globalThis.fetch;
    const runner = patchForwarder(
      new AgentSandboxRunner({ kubeConfig: KC, stateStore: store }),
    );
    await runner.ensure(ID);
    expect(fakeState.bootstrapCalls).toHaveLength(1);
    expect(fakeState.bootstrapCalls[0]!.claimNonce).toBe(nonce);
    expect(fakeState.bootstrapCalls[0]!.daemonToken).toBe("tok-rehydrate");
    expect(fakeState.bootstrapCalls[0]!.cloneUrl).toBe("https://x.test/r.git");
  });

  it("phase=bootstrapping: waits for ready, no bootstrap call", async () => {
    const store = makeStore();
    const handle = composeClaimName(ID, null);
    await store.put(ID, "agent-sandbox", {
      handle,
      state: {
        podName: handle,
        token: "tok",
        workdir: "/app",
        ensureOpts: {},
        claimNonce: "n".padEnd(64, "0"),
      },
    });
    fakeState.claims.set(handle, {
      resource: {
        metadata: { name: handle },
        status: { conditions: [{ type: "Ready", status: "True" }] },
      },
    });
    fakeState.daemonPhase = "bootstrapping";
    // Flip to ready on the second probe so waitForDaemonReady terminates.
    let probeCount = 0;
    const router = makeFetchRouter();
    globalThis.fetch = (async (input, init) => {
      const u =
        typeof input === "string" ? new URL(input) : new URL(input.toString());
      if (u.hostname === "127.0.0.1" && u.pathname === "/health") {
        probeCount += 1;
        if (probeCount >= 2) fakeState.daemonPhase = "ready";
      }
      return router(input, init);
    }) as unknown as typeof globalThis.fetch;
    const runner = patchForwarder(
      new AgentSandboxRunner({ kubeConfig: KC, stateStore: store }),
    );
    await runner.ensure(ID);
    expect(fakeState.bootstrapCalls).toHaveLength(0);
    expect(probeCount).toBeGreaterThanOrEqual(2);
  });

  it("phase=failed: deletes claim, clears row, recurses to provision", async () => {
    const store = makeStore();
    const handle = composeClaimName(ID, null);
    await store.put(ID, "agent-sandbox", {
      handle,
      state: {
        podName: handle,
        token: "tok-old",
        workdir: "/app",
        ensureOpts: {},
        claimNonce: "n".padEnd(64, "0"),
      },
    });
    fakeState.claims.set(handle, {
      resource: {
        metadata: { name: handle },
        status: { conditions: [{ type: "Ready", status: "True" }] },
      },
    });
    fakeState.daemonPhase = "failed";
    fakeState.onAfterDelete = () => {
      // Once the recovery delete fires, flip the daemon to ready so the
      // recursive provision sees a healthy daemon on probe.
      fakeState.daemonPhase = "ready";
    };
    const runner = patchForwarder(
      new AgentSandboxRunner({
        kubeConfig: KC,
        stateStore: store,
        tokenGenerator: () => "tok-fresh",
      }),
    );
    await runner.ensure(ID);
    expect(fakeState.callCounts.delete).toBeGreaterThanOrEqual(1);
    expect(fakeState.callCounts.create).toBeGreaterThanOrEqual(1);
    const row = await store.get(ID, "agent-sandbox");
    expect(row).not.toBeNull();
    expect(row!.state.token).toBe("tok-fresh");
  });
});

describe("adopt — legacy claim with empty state-store returns null", () => {
  it("phase=ready, no row → adopt returns null, caller recreates", async () => {
    const store = makeStore();
    const handle = composeClaimName(ID, null);
    fakeState.claims.set(handle, {
      resource: {
        metadata: { name: handle, labels: {} },
        status: { conditions: [{ type: "Ready", status: "True" }] },
      },
    });
    fakeState.daemonPhase = "ready";
    const runner = patchForwarder(
      new AgentSandboxRunner({
        kubeConfig: KC,
        stateStore: store,
        tokenGenerator: () => "tok-fresh-after-adopt",
      }),
    );
    await runner.ensure(ID);
    expect(fakeState.callCounts.delete).toBeGreaterThanOrEqual(1);
    expect(fakeState.callCounts.create).toBeGreaterThanOrEqual(1);
    const row = await store.get(ID, "agent-sandbox");
    expect(row).not.toBeNull();
    expect(row!.state.token).toBe("tok-fresh-after-adopt");
  });
});

describe("two-replica race on the same tenant", () => {
  it("deterministic claim name → loser falls into rehydrate, no second create", async () => {
    const handleA = composeClaimName(ID, null);
    const handleB = composeClaimName(ID, null);
    expect(handleA).toBe(handleB);

    const sharedStore = makeStore();
    const runnerA = patchForwarder(
      new AgentSandboxRunner({
        kubeConfig: KC,
        stateStore: sharedStore,
        tokenGenerator: () => "tok-A",
      }),
    );
    const runnerB = patchForwarder(
      new AgentSandboxRunner({
        kubeConfig: KC,
        stateStore: sharedStore,
        tokenGenerator: () => "tok-B",
      }),
    );

    await runnerA.ensure(ID);
    const createCountAfterA = fakeState.callCounts.create;
    await runnerB.ensure(ID);
    expect(fakeState.callCounts.create).toBe(createCountAfterA);
  });
});

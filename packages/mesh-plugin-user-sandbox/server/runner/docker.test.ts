import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { DockerExecFn, DockerResult } from "../docker-cli";
import { DockerSandboxRunner } from "./docker";
import type {
  RunnerStateRecord,
  RunnerStateRecordWithId,
  RunnerStatePut,
  RunnerStateStore,
} from "./state-store";
import type { SandboxId } from "./types";

// -----------------------------------------------------------------------------
// Exec mock: matches on args[0] + sub-arg patterns and returns canned results.
// -----------------------------------------------------------------------------

interface ExecCall {
  args: string[];
  timeoutMs?: number;
}

type Responder = (args: string[]) => DockerResult | Promise<DockerResult>;

function makeExec(responder: Responder): {
  exec: DockerExecFn;
  calls: ExecCall[];
} {
  const calls: ExecCall[] = [];
  const exec: DockerExecFn = async (args, timeoutMs) => {
    calls.push({ args: [...args], timeoutMs });
    return await responder(args);
  };
  return { exec, calls };
}

/**
 * Defaults that cover the happy path:
 * - `run` → fake 64-char container id
 * - `port` → "0.0.0.0:32768\n::32768"  (matches the /:(\d+)$/ regex)
 * - `ps`/`ps -aq` → empty by default (no existing containers)
 * - `inspect` → "true" (container running)
 * - `stop` → {code: 0}
 * - fallback → empty stdout, code 0
 */
const FAKE_ID =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
let portCounter = 32768;

function defaultResponder(args: string[]): DockerResult {
  const [sub] = args;
  if (sub === "run") {
    return { stdout: `${FAKE_ID}\n`, stderr: "", code: 0 };
  }
  if (sub === "port") {
    const port = portCounter++;
    return { stdout: `0.0.0.0:${port}\n::${port}\n`, stderr: "", code: 0 };
  }
  if (sub === "ps") {
    return { stdout: "", stderr: "", code: 0 };
  }
  if (sub === "inspect") {
    return { stdout: "true\n", stderr: "", code: 0 };
  }
  if (sub === "stop") {
    return { stdout: "", stderr: "", code: 0 };
  }
  if (sub === "logs") {
    return { stdout: "", stderr: "", code: 0 };
  }
  return { stdout: "", stderr: "", code: 0 };
}

// -----------------------------------------------------------------------------
// In-memory state-store mock.
// -----------------------------------------------------------------------------

function makeStore(): RunnerStateStore & {
  _byId: Map<string, RunnerStateRecordWithId>;
  _byHandle: Map<string, RunnerStateRecordWithId>;
  putCalls: { id: SandboxId; kind: string; entry: RunnerStatePut }[];
  deleteCalls: { id: SandboxId; kind: string }[];
  deleteByHandleCalls: { kind: string; handle: string }[];
} {
  const byId = new Map<string, RunnerStateRecordWithId>();
  const byHandle = new Map<string, RunnerStateRecordWithId>();
  const putCalls: { id: SandboxId; kind: string; entry: RunnerStatePut }[] = [];
  const deleteCalls: { id: SandboxId; kind: string }[] = [];
  const deleteByHandleCalls: { kind: string; handle: string }[] = [];

  const key = (id: SandboxId, kind: string) =>
    `${id.userId}:${id.projectRef}:${kind}`;

  const store = {
    _byId: byId,
    _byHandle: byHandle,
    putCalls,
    deleteCalls,
    deleteByHandleCalls,
    async get(id: SandboxId, kind: string): Promise<RunnerStateRecord | null> {
      return byId.get(key(id, kind)) ?? null;
    },
    async getByHandle(
      kind: string,
      handle: string,
    ): Promise<RunnerStateRecordWithId | null> {
      return byHandle.get(`${kind}:${handle}`) ?? null;
    },
    async put(
      id: SandboxId,
      kind: string,
      entry: RunnerStatePut,
    ): Promise<void> {
      putCalls.push({ id, kind, entry });
      const record: RunnerStateRecordWithId = {
        id,
        handle: entry.handle,
        state: entry.state,
        updatedAt: new Date(),
      };
      byId.set(key(id, kind), record);
      byHandle.set(`${kind}:${entry.handle}`, record);
    },
    async delete(id: SandboxId, kind: string): Promise<void> {
      deleteCalls.push({ id, kind });
      const rec = byId.get(key(id, kind));
      byId.delete(key(id, kind));
      if (rec) byHandle.delete(`${kind}:${rec.handle}`);
    },
    async deleteByHandle(kind: string, handle: string): Promise<void> {
      deleteByHandleCalls.push({ kind, handle });
      const rec = byHandle.get(`${kind}:${handle}`);
      byHandle.delete(`${kind}:${handle}`);
      if (rec) byId.delete(key(rec.id, kind));
    },
  };
  return store;
}

// -----------------------------------------------------------------------------
// Fetch harness (for /health + /_daemon/*).
// -----------------------------------------------------------------------------

interface FetchCall {
  input: string;
  init: RequestInit & { duplex?: string };
}

function installFetch(
  responder: (call: FetchCall) => Promise<Response> | Response,
): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  globalThis.fetch = mock(async (input: unknown, init?: unknown) => {
    const call: FetchCall = {
      input: String(input),
      init: (init ?? {}) as RequestInit & { duplex?: string },
    };
    calls.push(call);
    return await responder(call);
  }) as unknown as typeof fetch;
  return { calls };
}

let origFetch: typeof fetch;

beforeEach(() => {
  origFetch = globalThis.fetch;
  portCounter = 32768;
});

afterEach(() => {
  globalThis.fetch = origFetch;
});

// Common SandboxId helper.
const ID: SandboxId = { userId: "u_1", projectRef: "agent:o:v:main" };

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("DockerSandboxRunner.ensure() — fresh provision", () => {
  it("runs container with hardening flags, reads ports, probes health, persists", async () => {
    const { exec, calls } = makeExec(defaultResponder);
    const store = makeStore();
    installFetch(() => new Response("ok", { status: 200 }));

    const runner = new DockerSandboxRunner({
      image: "test-image:latest",
      exec,
      stateStore: store,
    });

    const sandbox = await runner.ensure(ID);

    // handle = first 32 chars of fake id
    expect(sandbox.handle).toBe(FAKE_ID.slice(0, 32));
    expect(sandbox.workdir).toBe("/app");
    // Preview URL is derived from the handle via local ingress; it's non-null
    // even without a workload hint because the daemon may auto-sniff the repo.
    expect(sandbox.previewUrl).toBe(
      `http://${sandbox.handle}.sandboxes.localhost:7070/`,
    );

    // Assert the `docker run` invocation carried the hardening flags, labels,
    // env var, and port publishes.
    const runCall = calls.find((c) => c.args[0] === "run");
    expect(runCall).toBeDefined();
    const runArgs = runCall!.args;
    expect(runArgs).toContain("--cap-drop=ALL");
    expect(runArgs).toContain("--security-opt=no-new-privileges");
    expect(runArgs).toContain("--pids-limit=512");
    expect(runArgs).toContain("--memory=2g");
    expect(runArgs).toContain("--cpus=1");
    // Container-filesystem hardening.
    expect(runArgs).toContain("--read-only");
    expect(runArgs).toContain("--tmpfs=/tmp:rw,nosuid,nodev,size=256m");
    // Writable mounts for the bits --read-only would otherwise break:
    // /app (user workload + clone target) and /home/sandbox (pm caches).
    const volAppIdx = runArgs.findIndex(
      (a, i) => a === "-v" && runArgs[i + 1] === "/app",
    );
    expect(volAppIdx).toBeGreaterThanOrEqual(0);
    const volHomeIdx = runArgs.findIndex(
      (a, i) => a === "-v" && runArgs[i + 1] === "/home/sandbox",
    );
    expect(volHomeIdx).toBeGreaterThanOrEqual(0);

    // Labels: root + id-scoped.
    const labelRoot = runArgs.findIndex(
      (a, i) => a === "--label" && runArgs[i + 1] === "mesh-sandbox=1",
    );
    expect(labelRoot).toBeGreaterThanOrEqual(0);
    const labelId = runArgs.findIndex(
      (a, i) =>
        a === "--label" && runArgs[i + 1]?.startsWith("mesh-sandbox.id="),
    );
    expect(labelId).toBeGreaterThanOrEqual(0);

    // DAEMON_TOKEN env present (value random, just assert shape).
    const tokenEnvIdx = runArgs.findIndex(
      (a, i) => a === "-e" && runArgs[i + 1]?.startsWith("DAEMON_TOKEN="),
    );
    expect(tokenEnvIdx).toBeGreaterThanOrEqual(0);

    // Image is last non-command arg.
    expect(runArgs).toContain("test-image:latest");

    // `port` was called at least twice (daemon + dev).
    const portCalls = calls.filter((c) => c.args[0] === "port");
    expect(portCalls.length).toBeGreaterThanOrEqual(2);
    expect(portCalls.map((c) => c.args[2])).toEqual(
      expect.arrayContaining(["9000/tcp", "3000/tcp"]),
    );

    // stateStore.put called with handle + state.
    expect(store.putCalls).toHaveLength(1);
    const persisted = store.putCalls[0]!;
    expect(persisted.kind).toBe("docker");
    expect(persisted.entry.handle).toBe(FAKE_ID.slice(0, 32));
    expect(persisted.entry.state.token).toBeDefined();
    expect(persisted.entry.state.daemonUrl).toMatch(/^http:\/\/127\.0\.0\.1:/);
  });
});

describe("DockerSandboxRunner.ensure() — in-process dedupe", () => {
  it("two concurrent ensure() calls share one docker run", async () => {
    let runCount = 0;
    const { exec, calls } = makeExec((args) => {
      if (args[0] === "run") {
        runCount++;
        return {
          stdout: `${FAKE_ID}\n`,
          stderr: "",
          code: 0,
        };
      }
      return defaultResponder(args);
    });
    installFetch(() => new Response("ok", { status: 200 }));

    const runner = new DockerSandboxRunner({ exec });

    const [a, b] = await Promise.all([runner.ensure(ID), runner.ensure(ID)]);
    expect(a.handle).toBe(b.handle);
    expect(runCount).toBe(1);
    // Keep a reference to `calls` to avoid unused warning.
    expect(calls.length).toBeGreaterThan(0);
  });
});

describe("DockerSandboxRunner.ensure() — resume from persisted state", () => {
  it("uses persisted token/workdir, no docker run, alive + health ok", async () => {
    let runCount = 0;
    const { exec, calls } = makeExec((args) => {
      if (args[0] === "run") runCount++;
      return defaultResponder(args);
    });
    const store = makeStore();

    // Pre-populate the store with a valid record.
    const persistedHandle = FAKE_ID.slice(0, 32);
    await store.put(ID, "docker", {
      handle: persistedHandle,
      state: {
        token: "persisted-token-abc",
        workdir: "/app",
        daemonUrl: "http://127.0.0.1:1111", // will be replaced after readPort
        devPort: 40000,
        devContainerPort: 3000,
        daemonPort: 40001,
        repoAttached: false,
        workload: null,
      },
    });
    store.putCalls.length = 0; // reset so we only observe new puts

    installFetch(() => new Response("ok", { status: 200 })); // /health ok

    const runner = new DockerSandboxRunner({ exec, stateStore: store });
    const sandbox = await runner.ensure(ID);

    expect(sandbox.handle).toBe(persistedHandle);
    expect(runCount).toBe(0); // no new docker run
    // Sanity: at least the `port` sub was invoked.
    expect(calls.some((c) => c.args[0] === "port")).toBe(true);
  });
});

describe("DockerSandboxRunner.ensure() — attach-repo failure cleanup", () => {
  it("stops the orphaned container and rethrows when bootstrap fails", async () => {
    const stopCalls: string[] = [];
    const { exec } = makeExec((args) => {
      if (args[0] === "stop") {
        stopCalls.push(args[args.length - 1]!);
      }
      return defaultResponder(args);
    });
    const store = makeStore();

    // First fetch: /health → ok. Second fetch (bootstrap bash): throws.
    let fetchCount = 0;
    installFetch(() => {
      fetchCount++;
      if (fetchCount === 1) return new Response("ok", { status: 200 });
      throw new Error("bootstrap boom");
    });

    const runner = new DockerSandboxRunner({ exec, stateStore: store });

    const handle = FAKE_ID.slice(0, 32);
    await expect(
      runner.ensure(ID, {
        repo: {
          cloneUrl: "https://example.com/r.git",
          userName: "u",
          userEmail: "u@e",
        },
      }),
    ).rejects.toThrow(/bootstrap boom/);

    expect(stopCalls).toContain(handle);
    // byHandle entry removed → alive uses exec_('inspect') which would still
    // return "true" for our mock; instead verify via lookup path by calling
    // `resolveDevPort` which reads byHandle first, then store. Since persist
    // runs AFTER bootstrap, the store is also empty.
    const devPort = await runner.resolveDevPort(handle);
    expect(devPort).toBeNull();
    expect(store.putCalls).toHaveLength(0);
  });
});

describe("DockerSandboxRunner.sweepOrphans()", () => {
  it("stops every container returned by the ps filter", async () => {
    const stopCalls: string[] = [];
    const { exec } = makeExec((args) => {
      if (args[0] === "ps") {
        return { stdout: "id1\nid2\nid3\n", stderr: "", code: 0 };
      }
      if (args[0] === "stop") {
        stopCalls.push(args[args.length - 1]!);
        return { stdout: "", stderr: "", code: 0 };
      }
      return defaultResponder(args);
    });
    const store = makeStore();
    const runner = new DockerSandboxRunner({ exec, stateStore: store });

    const n = await runner.sweepOrphans();

    expect(n).toBe(3);
    expect(stopCalls.sort()).toEqual(["id1", "id2", "id3"]);
    expect(store.deleteByHandleCalls.map((c) => c.handle).sort()).toEqual([
      "id1",
      "id2",
      "id3",
    ]);
  });

  it("returns full count even if one stop rejects", async () => {
    const stopCalls: string[] = [];
    const { exec } = makeExec((args) => {
      if (args[0] === "ps") {
        return { stdout: "a\nb\nc\n", stderr: "", code: 0 };
      }
      if (args[0] === "stop") {
        stopCalls.push(args[args.length - 1]!);
        if (args[args.length - 1] === "b") {
          return Promise.reject(new Error("kaboom"));
        }
        return { stdout: "", stderr: "", code: 0 };
      }
      return defaultResponder(args);
    });
    const runner = new DockerSandboxRunner({ exec });
    const n = await runner.sweepOrphans();
    expect(n).toBe(3);
    expect(stopCalls.sort()).toEqual(["a", "b", "c"]);
  });
});

describe("DockerSandboxRunner.delete()", () => {
  it("best-effort dev-stop, container stop, and store.delete with record", async () => {
    const stopCalls: string[] = [];
    const { exec } = makeExec((args) => {
      if (args[0] === "stop") {
        stopCalls.push(args[args.length - 1]!);
      }
      return defaultResponder(args);
    });
    const store = makeStore();

    // /health ok for ensure, then /dev/stop for delete.
    const { calls: fetchCalls } = installFetch(
      () => new Response("", { status: 204 }),
    );

    const runner = new DockerSandboxRunner({ exec, stateStore: store });
    const sb = await runner.ensure(ID);

    // Clear fetch calls so we only see what delete() triggers.
    fetchCalls.length = 0;

    await runner.delete(sb.handle);

    // fetch to /_daemon/dev/stop happened once.
    expect(fetchCalls.some((c) => c.input.endsWith("/_daemon/dev/stop"))).toBe(
      true,
    );
    // docker stop hit the handle.
    expect(stopCalls).toContain(sb.handle);
    // store.delete was called (we had a record in memory).
    expect(store.deleteCalls).toHaveLength(1);
    expect(store.deleteCalls[0]!.id.userId).toBe(ID.userId);
  });

  it("falls back to deleteByHandle when no record in memory", async () => {
    const stopCalls: string[] = [];
    const { exec } = makeExec((args) => {
      if (args[0] === "stop") {
        stopCalls.push(args[args.length - 1]!);
      }
      return defaultResponder(args);
    });
    const store = makeStore();
    const runner = new DockerSandboxRunner({ exec, stateStore: store });
    installFetch(() => new Response("", { status: 204 }));

    const unknownHandle = "unknownhandle1234567890abcdef";
    await runner.delete(unknownHandle);

    // No in-memory record, so daemon fetch is skipped; docker stop still runs.
    expect(stopCalls).toContain(unknownHandle);
    // Fallback path.
    expect(store.deleteByHandleCalls).toHaveLength(1);
    expect(store.deleteByHandleCalls[0]!.handle).toBe(unknownHandle);
    expect(store.deleteCalls).toHaveLength(0);
  });
});

describe("DockerSandboxRunner — sanity: preview URL & port resolvers", () => {
  it("composePreviewUrl uses pattern when workload provided; resolvers return ports", async () => {
    const { exec } = makeExec(defaultResponder);
    installFetch(() => new Response("ok", { status: 200 }));

    const runner = new DockerSandboxRunner({
      exec,
      previewUrlPattern: "https://preview.example.com/{handle}",
    });
    const sb = await runner.ensure(ID, {
      workload: { runtime: "bun", packageManager: "bun", devPort: 3000 },
    });
    expect(sb.previewUrl).toBe(`https://preview.example.com/${sb.handle}/`);

    expect(await runner.resolveDevPort(sb.handle)).toBeGreaterThan(0);
    expect(await runner.resolveDaemonPort(sb.handle)).toBeGreaterThan(0);
  });
});

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HostSandboxRunner } from "./runner";
import type { RunnerStateStore } from "../state-store";

function makeStore(): RunnerStateStore {
  const byKey = new Map<string, unknown>();
  const byHandle = new Map<string, unknown>();
  return {
    async get(id, kind) {
      return (
        (byKey.get(`${kind}:${id.userId}:${id.projectRef}`) as
          | { handle: string; state: Record<string, unknown>; updatedAt: Date }
          | undefined) ?? null
      );
    },
    async getByHandle(kind, handle) {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      return (byHandle.get(`${kind}:${handle}`) as any) ?? null;
    },
    async put(id, kind, entry) {
      const key = `${kind}:${id.userId}:${id.projectRef}`;
      const rec = {
        handle: entry.handle,
        state: entry.state,
        updatedAt: new Date(),
        id,
      };
      byKey.set(key, rec);
      byHandle.set(`${kind}:${entry.handle}`, rec);
    },
    async delete(id, kind) {
      const key = `${kind}:${id.userId}:${id.projectRef}`;
      const rec = byKey.get(key) as { handle: string } | undefined;
      byKey.delete(key);
      if (rec) byHandle.delete(`${kind}:${rec.handle}`);
    },
    async deleteByHandle(kind, handle) {
      byHandle.delete(`${kind}:${handle}`);
    },
    async withLock(_id, _kind, fn) {
      return fn(this);
    },
  };
}

describe("HostSandboxRunner.ensure provisioning", () => {
  let homeDir: string;
  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "host-runner-"));
  });
  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
  });

  it("spawns the daemon, probes /health, POSTs bootstrap, returns a Sandbox, and persists", async () => {
    let probeCount = 0;
    const fakeSpawn = mock(
      async (_args: {
        workdir: string;
        env: Record<string, string>;
        daemonPort: number;
      }) => ({
        pid: 4242,
        kill: () => true,
      }),
    );
    const fakeProbe = mock(async (_url: string) => {
      probeCount++;
      // First probe returns null (not yet ready), second returns healthy.
      if (probeCount === 1) return null;
      return {
        ready: true,
        bootId: "boot-from-daemon",
        setup: { running: false, done: true },
      };
    });
    const fakePostBootstrap = mock(async (_url: string, _payload: unknown) => ({
      phase: "bootstrapping",
      bootId: "boot-from-daemon",
      hash: "deadbeef",
    }));

    const runner = new HostSandboxRunner({
      homeDir,
      stateStore: makeStore(),
      _spawn: fakeSpawn,
      _probe: fakeProbe,
      _postBootstrap: fakePostBootstrap,
    });

    const sandbox = await runner.ensure(
      { userId: "u1", projectRef: "vmcp:1:branch:main" },
      {
        repo: {
          cloneUrl: "https://example.com/x.git",
          userName: "u",
          userEmail: "u@x",
          branch: "main",
        },
      },
    );

    expect(sandbox.handle).toMatch(/^[a-z0-9-]+$/);
    expect(sandbox.workdir).toBe(join(homeDir, "sandboxes", sandbox.handle));
    expect(sandbox.previewUrl).toMatch(/^http:\/\/[a-z0-9-]+\.localhost:\d+\//);
    expect(fakeSpawn).toHaveBeenCalledTimes(1);
    expect(probeCount).toBeGreaterThanOrEqual(2);

    // Daemon env carries only the bootstrap-independent pieces; tenant
    // material (runtime, repo, identity) moved to the bootstrap POST.
    const spawnArgs = fakeSpawn.mock.calls[0][0];
    expect(spawnArgs.env.DAEMON_TOKEN).toMatch(/^[0-9a-f]{48}$/);
    expect(spawnArgs.env.DAEMON_BOOT_ID).toBeTruthy();
    expect(spawnArgs.env.APP_ROOT).toBe(sandbox.workdir);
    expect(spawnArgs.env.PROXY_PORT).toBe(String(spawnArgs.daemonPort));
    expect(spawnArgs.env.DAEMON_BOOTSTRAP_DIR).toBe(
      join(homeDir, "bootstraps", sandbox.handle),
    );
    // Crucial: bootstrap dir must NOT be inside the workdir, or
    // persistence.writeBootstrap's mkdir would pre-create the appRoot and
    // break `git clone` with "destination already exists and is not empty".
    expect(spawnArgs.env.DAEMON_BOOTSTRAP_DIR.startsWith(sandbox.workdir)).toBe(
      false,
    );
    expect(spawnArgs.env.CLONE_URL).toBeUndefined();
    expect(spawnArgs.env.BRANCH).toBeUndefined();
    expect(spawnArgs.env.DEV_PORT).toBeUndefined();
    expect(spawnArgs.env.RUNTIME).toBeUndefined();
    // PORT is the host-runner's port-collision escape hatch: a pre-allocated
    // free port that the daemon and its descendants inherit, so frameworks
    // that respect process.env.PORT bind there instead of 3000.
    expect(spawnArgs.env.PORT).toMatch(/^\d+$/);
    expect(Number(spawnArgs.env.PORT)).toBeGreaterThan(0);
    expect(Number(spawnArgs.env.PORT)).not.toBe(Number(spawnArgs.daemonPort));
    // SANDBOX_INGRESS_PORT covers the nested mesh-in-mesh case: an inner
    // mesh would otherwise hardcode 7070 and collide with the outer's
    // ingress. Each sandbox gets its own free ingress port.
    expect(spawnArgs.env.SANDBOX_INGRESS_PORT).toMatch(/^\d+$/);
    expect(Number(spawnArgs.env.SANDBOX_INGRESS_PORT)).toBeGreaterThan(0);
    expect(Number(spawnArgs.env.SANDBOX_INGRESS_PORT)).not.toBe(
      Number(spawnArgs.daemonPort),
    );
    expect(spawnArgs.env.SANDBOX_INGRESS_PORT).not.toBe(spawnArgs.env.PORT);

    // Bootstrap was POSTed once with the tenant payload. cloneUrl/branch are
    // carried so the daemon clones the repo before install + autostart.
    // devPort is NOT carried; the probe discovers whatever port the dev
    // server binds to.
    expect(fakePostBootstrap).toHaveBeenCalledTimes(1);
    const [bootstrapUrl, bootstrapPayload] = fakePostBootstrap.mock
      .calls[0] as [
      string,
      {
        schemaVersion: number;
        runtime?: string;
        gitUserName?: string;
        gitUserEmail?: string;
        cloneUrl?: string;
        repoName?: string;
        branch?: string;
        devPort?: number;
      },
    ];
    expect(bootstrapUrl).toBe(`http://127.0.0.1:${spawnArgs.daemonPort}`);
    expect(bootstrapPayload.schemaVersion).toBe(1);
    expect(bootstrapPayload.runtime).toBe("bun");
    expect(bootstrapPayload.cloneUrl).toBe("https://example.com/x.git");
    expect(bootstrapPayload.repoName).toBe("x");
    expect(bootstrapPayload.branch).toBe("main");
    expect(bootstrapPayload.gitUserName).toBe("u");
    expect(bootstrapPayload.gitUserEmail).toBe("u@x");
    expect(bootstrapPayload.devPort).toBeUndefined();
  });

  it("returns the cached sandbox on a second ensure() call", async () => {
    const fakeSpawn = mock(async () => ({ pid: 5000, kill: () => true }));
    const fakeProbe = mock(async () => ({
      ready: true,
      bootId: "b",
      setup: { running: false, done: true },
    }));
    const fakePostBootstrap = mock(async () => ({
      phase: "bootstrapping",
      bootId: "b",
      hash: "h",
    }));

    const runner = new HostSandboxRunner({
      homeDir,
      stateStore: makeStore(),
      _spawn: fakeSpawn,
      _probe: fakeProbe,
      _postBootstrap: fakePostBootstrap,
      // Make pid 5000 always alive for the cache hit check.
      _isAlive: (pid) => pid === 5000,
    });

    const id = { userId: "u2", projectRef: "vmcp:2:branch:dev" };
    const opts = {
      repo: {
        cloneUrl: "https://example.com/y.git",
        userName: "u",
        userEmail: "u@x",
        branch: "dev",
      },
    };

    const a = await runner.ensure(id, opts);
    const b = await runner.ensure(id, opts);

    expect(a.handle).toBe(b.handle);
    expect(fakeSpawn).toHaveBeenCalledTimes(1);
  });
});

describe("HostSandboxRunner.ensure rehydration", () => {
  let homeDir: string;
  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "host-runner-rehydrate-"));
  });
  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
  });

  it("returns the previously-provisioned record when /health still answers", async () => {
    const store = makeStore();
    const id = { userId: "u1", projectRef: "vmcp:1:branch:main" };

    const handle = "deadbe-abcde";
    await store.put(id, "host", {
      handle,
      state: {
        pid: process.pid,
        daemonPort: 12345,
        daemonUrl: "http://127.0.0.1:12345",
        workdir: join(homeDir, "sandboxes", handle),
        token: "t".repeat(48),
        bootId: "old-boot",
      },
    });

    const fakeProbe = mock(async () => ({
      ready: true,
      bootId: "old-boot",
      setup: { running: false, done: true },
    }));
    const fakeSpawn = mock(async () => {
      throw new Error("should not be called on rehydrate");
    });

    const runner = new HostSandboxRunner({
      homeDir,
      stateStore: store,
      _spawn: fakeSpawn,
      _probe: fakeProbe,
      _isAlive: (pid) => pid === process.pid,
    });

    const port = await runner.resolveDaemonPort(handle);
    expect(port).toBe(12345);
    expect(fakeProbe).toHaveBeenCalled();
    expect(fakeSpawn).not.toHaveBeenCalled();
  });

  it("returns null and purges state when the persisted PID is dead", async () => {
    const store = makeStore();
    const id = { userId: "u1", projectRef: "vmcp:1:branch:dead" };
    const handle = "deadpid-abcde";

    await store.put(id, "host", {
      handle,
      state: {
        pid: 999_999_999, // unlikely-alive
        daemonPort: 12345,
        daemonUrl: "http://127.0.0.1:12345",
        workdir: join(homeDir, "sandboxes", handle),
        token: "t".repeat(48),
        bootId: "old-boot",
      },
    });

    const fakeProbe = mock(async () => ({
      ready: true,
      bootId: "x",
      setup: { running: false, done: true },
    }));

    const runner = new HostSandboxRunner({
      homeDir,
      stateStore: store,
      _spawn: mock(async () => ({ pid: 1234, kill: () => true })),
      _probe: fakeProbe,
      _isAlive: () => false, // pretend nothing is alive
    });

    const port = await runner.resolveDaemonPort(handle);
    expect(port).toBeNull();
    // probe should NOT be called when the pid liveness check fails first.
    expect(fakeProbe).not.toHaveBeenCalled();
  });

  it("returns null when /health does not respond", async () => {
    const store = makeStore();
    const id = { userId: "u1", projectRef: "vmcp:1:branch:nohealth" };
    const handle = "noheal-abcde";

    await store.put(id, "host", {
      handle,
      state: {
        pid: process.pid,
        daemonPort: 12345,
        daemonUrl: "http://127.0.0.1:12345",
        workdir: join(homeDir, "sandboxes", handle),
        token: "t".repeat(48),
        bootId: "old-boot",
      },
    });

    const fakeProbe = mock(async () => null);

    const runner = new HostSandboxRunner({
      homeDir,
      stateStore: store,
      _spawn: mock(async () => ({ pid: 1234, kill: () => true })),
      _probe: fakeProbe,
      _isAlive: (pid) => pid === process.pid,
    });

    const port = await runner.resolveDaemonPort(handle);
    expect(port).toBeNull();
    expect(fakeProbe).toHaveBeenCalled();
  });
});

describe("HostSandboxRunner.delete", () => {
  let homeDir: string;
  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), "host-runner-delete-"));
  });
  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
  });

  it("kills the daemon, removes the workdir, and clears state-store entry", async () => {
    const store = makeStore();
    const id = { userId: "u1", projectRef: "vmcp:1:branch:main" };

    const killed: { signal: NodeJS.Signals }[] = [];
    let aliveCount = 0;
    const fakeSpawn = mock(async () => ({ pid: 99999, kill: () => true }));
    const fakeProbe = mock(async () => ({
      ready: true,
      bootId: "boot",
      setup: { running: false, done: true },
    }));
    const fakePostBootstrap = mock(async () => ({
      phase: "bootstrapping",
      bootId: "boot",
      hash: "h",
    }));

    const runner = new HostSandboxRunner({
      homeDir,
      stateStore: store,
      _spawn: fakeSpawn,
      _probe: fakeProbe,
      _postBootstrap: fakePostBootstrap,
      _kill: (_pid, signal) => killed.push({ signal }),
      // Alive on the first check (entering grace loop), then dead. This
      // ensures the grace loop loops at least once and exits cleanly.
      _isAlive: () => {
        aliveCount++;
        return aliveCount === 1;
      },
    });

    const sandbox = await runner.ensure(id, {
      repo: {
        cloneUrl: "https://example.com/x.git",
        userName: "u",
        userEmail: "u@x",
        branch: "main",
      },
    });

    // Workdir parent should exist after ensure (mkdir of dirname).
    const { existsSync } = await import("node:fs");
    expect(existsSync(join(homeDir, "sandboxes"))).toBe(true);

    await runner.delete(sandbox.handle);

    expect(killed.length).toBeGreaterThanOrEqual(1);
    expect(killed[0].signal).toBe("SIGTERM");
    // Workdir for this sandbox is gone.
    expect(existsSync(sandbox.workdir)).toBe(false);
    // State store cleared.
    expect(await store.getByHandle("host", sandbox.handle)).toBeNull();
  });

  it("escalates to SIGKILL when the daemon ignores SIGTERM", async () => {
    const store = makeStore();
    const id = { userId: "u1", projectRef: "vmcp:1:branch:zombie" };

    const killed: NodeJS.Signals[] = [];
    const fakeSpawn = mock(async () => ({ pid: 88888, kill: () => true }));
    const fakeProbe = mock(async () => ({
      ready: true,
      bootId: "b",
      setup: { running: false, done: true },
    }));
    const fakePostBootstrap = mock(async () => ({
      phase: "bootstrapping",
      bootId: "b",
      hash: "h",
    }));

    const runner = new HostSandboxRunner({
      homeDir,
      stateStore: store,
      _spawn: fakeSpawn,
      _probe: fakeProbe,
      _postBootstrap: fakePostBootstrap,
      _kill: (_pid, signal) => killed.push(signal),
      // Always alive — daemon never dies after SIGTERM.
      _isAlive: () => true,
    });

    const sandbox = await runner.ensure(id, {
      repo: {
        cloneUrl: "https://example.com/y.git",
        userName: "u",
        userEmail: "u@x",
        branch: "zombie",
      },
    });

    await runner.delete(sandbox.handle);

    expect(killed).toContain("SIGTERM");
    expect(killed).toContain("SIGKILL");
  });

  it("is a no-op for an unknown handle (no throw, no work)", async () => {
    const runner = new HostSandboxRunner({
      homeDir,
      stateStore: makeStore(),
      _spawn: mock(async () => ({ pid: 0, kill: () => true })),
      _probe: mock(async () => null),
      _kill: () => {
        throw new Error("should not be called");
      },
      _isAlive: () => false,
    });

    await runner.delete("does-not-exist");
    // No assertions needed — passing without throwing is the contract.
  });
});

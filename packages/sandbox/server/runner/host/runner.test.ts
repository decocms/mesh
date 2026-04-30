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

  it("spawns the daemon, probes /health, returns a Sandbox, and persists", async () => {
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

    const runner = new HostSandboxRunner({
      homeDir,
      stateStore: makeStore(),
      _spawn: fakeSpawn,
      _probe: fakeProbe,
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

    // Verify the env passed to spawn includes required values.
    const spawnArgs = fakeSpawn.mock.calls[0][0];
    expect(spawnArgs.env.DAEMON_TOKEN).toMatch(/^[0-9a-f]{48}$/);
    expect(spawnArgs.env.DAEMON_BOOT_ID).toBeTruthy();
    expect(spawnArgs.env.APP_ROOT).toBe(sandbox.workdir);
    expect(spawnArgs.env.CLONE_URL).toBe("https://example.com/x.git");
    expect(spawnArgs.env.BRANCH).toBe("main");
    expect(spawnArgs.env.CLONE_DEPTH).toBe("full");
    expect(spawnArgs.env.PROXY_PORT).toBe(String(spawnArgs.daemonPort));
  });

  it("returns the cached sandbox on a second ensure() call", async () => {
    const fakeSpawn = mock(async () => ({ pid: 5000, kill: () => true }));
    const fakeProbe = mock(async () => ({
      ready: true,
      bootId: "b",
      setup: { running: false, done: true },
    }));

    const runner = new HostSandboxRunner({
      homeDir,
      stateStore: makeStore(),
      _spawn: fakeSpawn,
      _probe: fakeProbe,
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

import { describe, expect, it, mock } from "bun:test";
import { Broadcaster } from "../events/broadcast";
import type { PtyHandle } from "./pty-spawn";

// Mock the PTY layer so the unit suite stays decoupled from real PTY
// allocation. The two real failure modes we want coverage for are:
//   - ProcessManager records / forgets a child by name across run/exit/kill
//   - it broadcasts "processes" events around those transitions
// Real pty behavior (forkpty, signal forwarding) is exercised by node-pty's
// own tests and by the Docker / host integration paths. Linux CI has been
// observed to fail forkpty(3) under Bun, which is irrelevant to what's
// being asserted here.

let nextHandle: FakeHandle | null = null;

interface FakeHandle extends PtyHandle {
  fireExit: (code: number) => void;
  killCalls: string[];
}

function makeHandle(): FakeHandle {
  let exitCb: ((code: number) => void) | null = null;
  const killCalls: string[] = [];
  const handle: FakeHandle = {
    pid: 1234,
    onData: () => {},
    onExit: (cb) => {
      exitCb = cb;
    },
    kill: (sig) => {
      killCalls.push(sig ?? "SIGHUP");
    },
    fireExit: (code) => exitCb?.(code),
    killCalls,
  };
  return handle;
}

mock.module("./pty-spawn", () => ({
  spawnPty: () => {
    const h = makeHandle();
    nextHandle = h;
    return h;
  },
}));

const { ProcessManager } = await import("./run-process");

describe("ProcessManager", () => {
  it("spawns a command, records it, and emits processes event on close", async () => {
    const b = new Broadcaster(100);
    const pm = new ProcessManager({ broadcaster: b, dropPrivileges: false });
    pm.run("echo-test", "echo hi", "$ echo hi");
    expect(pm.activeNames()).toContain("echo-test");
    nextHandle?.fireExit(0);
    expect(pm.activeNames()).not.toContain("echo-test");
  });

  it("kill() returns false when nothing is running under that name", () => {
    const b = new Broadcaster(100);
    const pm = new ProcessManager({ broadcaster: b, dropPrivileges: false });
    expect(pm.kill("nothing")).toBe(false);
  });

  it("kill() terminates a tracked child", () => {
    const b = new Broadcaster(100);
    const pm = new ProcessManager({ broadcaster: b, dropPrivileges: false });
    pm.run("sleep-test", "sleep 30", "$ sleep 30");
    const h = nextHandle;
    expect(pm.activeNames()).toContain("sleep-test");
    expect(pm.kill("sleep-test")).toBe(true);
    expect(h?.killCalls).toContain("SIGTERM");
    h?.fireExit(143);
    expect(pm.activeNames()).not.toContain("sleep-test");
  });
});

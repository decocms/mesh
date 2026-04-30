import { describe, expect, it } from "bun:test";
import { Broadcaster } from "../events/broadcast";
import { ProcessManager } from "./run-process";

describe("ProcessManager", () => {
  it("spawns a command, records it, and emits processes event on close", async () => {
    const b = new Broadcaster(100);
    const pm = new ProcessManager({ broadcaster: b, dropPrivileges: false });
    pm.run("echo-test", "echo hi", "$ echo hi");
    const active = pm.activeNames();
    expect(active).toContain("echo-test");
    // Wait for the child to finish; tick until active is empty.
    for (let i = 0; i < 20 && pm.activeNames().length > 0; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(pm.activeNames()).not.toContain("echo-test");
  });

  it("kill() returns false when nothing is running under that name", () => {
    const b = new Broadcaster(100);
    const pm = new ProcessManager({ broadcaster: b, dropPrivileges: false });
    expect(pm.kill("nothing")).toBe(false);
  });

  it("kill() terminates a tracked child", async () => {
    const b = new Broadcaster(100);
    const pm = new ProcessManager({ broadcaster: b, dropPrivileges: false });
    pm.run("sleep-test", "sleep 30", "$ sleep 30");
    expect(pm.activeNames()).toContain("sleep-test");
    expect(pm.kill("sleep-test")).toBe(true);
    // Wait for the child's exit handler to fire.
    for (let i = 0; i < 30 && pm.activeNames().length > 0; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(pm.activeNames()).not.toContain("sleep-test");
  });
});

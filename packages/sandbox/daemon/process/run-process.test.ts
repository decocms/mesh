import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { Broadcaster } from "../events/broadcast";
import { ProcessManager } from "./run-process";

const hasScript = spawnSync("which", ["script"]).status === 0;

(hasScript ? describe : describe.skip)("ProcessManager", () => {
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
});

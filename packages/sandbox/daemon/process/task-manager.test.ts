import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskManager } from "./task-manager";

function makeManager() {
  const logsDir = mkdtempSync(join(tmpdir(), "tm-"));
  return new TaskManager({ logsDir });
}

describe("TaskManager intentional flag", () => {
  it("surfaces intentional=true on summary after killByLogName({intentional:true})", async () => {
    const tm = makeManager();
    const t = tm.spawn({
      command: "sleep 30",
      cwd: "/tmp",
      mode: "pipe",
      logName: "dev",
    });
    const finished = tm.finished(t.id)!;
    const killed = tm.killByLogName("dev", { intentional: true });
    expect(killed).toBe(1);
    await finished;
    const summary = tm.get(t.id)!;
    expect(summary.intentional).toBe(true);
  });

  it("surfaces intentional=false (or undefined) for default kills", async () => {
    const tm = makeManager();
    const t = tm.spawn({
      command: "sleep 30",
      cwd: "/tmp",
      mode: "pipe",
      logName: "dev",
    });
    const finished = tm.finished(t.id)!;
    tm.killByLogName("dev");
    await finished;
    const summary = tm.get(t.id)!;
    expect(summary.intentional).toBeFalsy();
  });
});

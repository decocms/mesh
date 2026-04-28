import { describe, expect, it } from "bun:test";
import { Broadcaster } from "../events/broadcast";
import { ProcessManager } from "../process/run-process";
import { SetupOrchestrator } from "../setup/orchestrator";
import { makeExecHandler } from "./exec";
import type { Config } from "../types";

const cfg: Config = {
  appRoot: "/tmp/x",
  packageManager: "npm",
  devPort: 3000,
  pathPrefix: "",
  cloneUrl: "https://github.com/example/repo.git",
  repoName: "repo",
  branch: "main",
  gitUserName: "test",
  gitUserEmail: "test@example.com",
  runtime: "node",
  daemonToken: "x".repeat(32),
  daemonBootId: "b",
  proxyPort: 9000,
};

function req(name: string): Request {
  return new Request(`http://x/_decopilot_vm/exec/${name}`, {
    method: "POST",
  });
}

describe("exec handler", () => {
  it("setup: returns 409 when setupRunning", async () => {
    const b = new Broadcaster(100);
    const pm = new ProcessManager({ broadcaster: b, dropPrivileges: false });
    const orch = new SetupOrchestrator({
      config: cfg,
      broadcaster: b,
      processManager: pm,
    });
    const h = makeExecHandler({
      config: cfg,
      processManager: pm,
      orchestrator: orch,
      setupState: orch.state,
    });
    orch.state.running = true;
    const res = await h(req("setup"));
    expect(res.status).toBe(409);
  });

  it("<unknown>: returns 400 when setup not done", async () => {
    const b = new Broadcaster(100);
    const pm = new ProcessManager({ broadcaster: b, dropPrivileges: false });
    const orch = new SetupOrchestrator({
      config: cfg,
      broadcaster: b,
      processManager: pm,
    });
    const h = makeExecHandler({
      config: cfg,
      processManager: pm,
      orchestrator: orch,
      setupState: orch.state,
    });
    const res = await h(req("dev"));
    expect(res.status).toBe(400);
  });
});

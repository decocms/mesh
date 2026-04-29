import { describe, expect, it } from "bun:test";
import { Broadcaster } from "../events/broadcast";
import { ProcessManager } from "../process/run-process";
import { SetupOrchestrator } from "./orchestrator";
import type { Config } from "../types";

const cfg: Config = {
  appRoot: "/tmp/nonexistent",
  cloneUrl: null,
  repoName: null,
  branch: null,
  gitUserName: null,
  gitUserEmail: null,
  packageManager: null,
  devPort: 3000,
  runtime: "node",
  daemonToken: "x".repeat(32),
  daemonBootId: "b",
  proxyPort: 9000,
  pathPrefix: "",
  cacheDir: null,
  gitCacheDir: null,
  sandboxCacheKey: null,
  nodeModulesCacheDir: null,
  nextCacheDir: null,
};

describe("SetupOrchestrator", () => {
  it("re-entry guard: concurrent run() returns false on the second call", async () => {
    const b = new Broadcaster(100);
    const pm = new ProcessManager({ broadcaster: b, dropPrivileges: false });
    const orch = new SetupOrchestrator({
      config: cfg,
      broadcaster: b,
      processManager: pm,
    });
    // Simulate in-flight setup.
    orch.state.running = true;
    expect(await orch.run()).toBe(false);
  });
});

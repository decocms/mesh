import { PACKAGE_MANAGER_DAEMON_CONFIG } from "../constants";
import type { ProcessManager } from "../process/run-process";
import type { SetupOrchestrator, SetupState } from "../setup/orchestrator";
import type { Config } from "../types";
import { jsonResponse } from "./body-parser";

export interface ExecDeps {
  config: Config;
  processManager: ProcessManager;
  orchestrator: SetupOrchestrator;
  setupState: SetupState;
}

/** Matches POST /_decopilot_vm/exec/<name>; name is the URL tail. */
export function makeExecHandler(deps: ExecDeps) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const name = url.pathname.slice("/_decopilot_vm/exec/".length);
    if (!name) return jsonResponse({ error: "missing script name" }, 400);
    if (name === "setup") {
      if (deps.setupState.running) {
        return jsonResponse({ error: "setup already running" }, 409);
      }
      // Fire and forget — matches existing semantics.
      void deps.orchestrator.run();
      return jsonResponse({ ok: true });
    }
    if (!deps.config.packageManager || !deps.setupState.done) {
      return jsonResponse({ error: "setup not complete" }, 400);
    }
    const pmConfig = PACKAGE_MANAGER_DAEMON_CONFIG[deps.config.packageManager];
    if (!pmConfig)
      return jsonResponse({ error: "unknown package manager" }, 400);
    const cmd = `${deps.config.pathPrefix}cd ${deps.config.appRoot} && HOST=0.0.0.0 HOSTNAME=0.0.0.0 PORT=${deps.config.devPort} ${pmConfig.runPrefix} ${name}`;
    deps.processManager.run(name, cmd, `$ ${pmConfig.runPrefix} ${name}`);
    return jsonResponse({ ok: true });
  };
}

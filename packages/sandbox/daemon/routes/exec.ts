import { PACKAGE_MANAGER_DAEMON_CONFIG } from "../constants";
import type { ProcessManager } from "../process/run-process";
import type { SetupOrchestrator, SetupState } from "../setup/orchestrator";
import type { Config } from "../types";
import { jsonResponse } from "./body-parser";

export interface ExecDeps {
  getConfig: () => Config;
  processManager: ProcessManager;
  orchestrator: SetupOrchestrator;
  setupState: SetupState;
}

/** Matches POST /_decopilot_vm/exec/<name>; name is the URL tail. */
export function makeExecHandler(deps: ExecDeps) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const rawName = url.pathname.slice("/_decopilot_vm/exec/".length);
    if (!rawName) return jsonResponse({ error: "missing script name" }, 400);
    let name: string;
    try {
      name = decodeURIComponent(rawName);
    } catch {
      return jsonResponse({ error: "invalid script name" }, 400);
    }
    if (name === "setup") {
      if (deps.setupState.running) {
        return jsonResponse({ error: "setup already running" }, 409);
      }
      // Fire and forget — matches existing semantics.
      void deps.orchestrator.run();
      return jsonResponse({ ok: true });
    }
    if (!deps.setupState.done) {
      return jsonResponse({ error: "setup not complete" }, 400);
    }
    const config = deps.getConfig();
    const portEnv =
      config.application?.developmentServer?.port !== undefined
        ? `PORT=${config.application?.developmentServer?.port} `
        : "";
    const envPrefix = `HOST=0.0.0.0 HOSTNAME=0.0.0.0 ${portEnv}`;
    if (!config.application?.packageManager) {
      return jsonResponse(
        { error: `command "${name}" not in commands and no packageManager` },
        400,
      );
    }
    const pmConfig =
      PACKAGE_MANAGER_DAEMON_CONFIG[config.application?.packageManager?.name];
    if (!pmConfig)
      return jsonResponse({ error: "unknown package manager" }, 400);
    const cmd = `${config.application?.runtime?.pathPrefix}cd ${config.appRoot} && ${envPrefix}${pmConfig.runPrefix} ${name}`;
    deps.processManager.run(name, cmd, `$ ${pmConfig.runPrefix} ${name}`);
    return jsonResponse({ ok: true });
  };
}

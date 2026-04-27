import {
  PACKAGE_MANAGER_DAEMON_CONFIG,
  WELL_KNOWN_STARTERS,
} from "../constants";
import type { Config } from "../types";
import type { ProcessManager } from "./run-process";

/**
 * Kick the first well-known starter (`dev` or `start`) after setup.
 * Matches the lifecycle model where the mesh server never sends an
 * explicit /dev/start — the daemon owns dev-server boot.
 */
export function autoStartDev(params: {
  config: Config;
  scripts: string[];
  pm: ProcessManager;
}): string | null {
  const { config, scripts, pm } = params;
  if (!config.packageManager) return null;
  const pmConfig = PACKAGE_MANAGER_DAEMON_CONFIG[config.packageManager];
  if (!pmConfig) return null;
  const starter = WELL_KNOWN_STARTERS.find((s) => scripts.includes(s));
  if (!starter) return null;
  const cmd = `${config.pathPrefix}cd ${config.appRoot} && HOST=0.0.0.0 HOSTNAME=0.0.0.0 PORT=${config.devPort} ${pmConfig.runPrefix} ${starter}`;
  pm.run(starter, cmd, `$ ${pmConfig.runPrefix} ${starter}`);
  return starter;
}

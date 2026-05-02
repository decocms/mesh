import {
  PACKAGE_MANAGER_DAEMON_CONFIG,
  WELL_KNOWN_STARTERS,
} from "../constants";
import type { Config } from "../types";
import type { ProcessManager } from "./run-process";

/**
 * Kick the autostart command after setup completes. Selection order:
 *   1. config.primary (a key in config.commands) — explicit pin wins.
 *   2. A well-known starter (`dev`/`start`) found in config.commands.
 *   3. A well-known starter from package.json scripts via `<pm> run <name>`.
 * Returns the chosen entry name, or null when nothing matches.
 */
export function autoStartDev(params: {
  config: Config;
  scripts: string[];
  pm: ProcessManager;
}): string | null {
  const { config, scripts, pm } = params;
  const portEnv =
    config.application?.developmentServer?.port !== undefined
      ? `PORT=${config.application?.developmentServer?.port} `
      : "";
  const envPrefix = `HOST=0.0.0.0 HOSTNAME=0.0.0.0 ${portEnv}`;

  if (!config.application?.packageManager) return null;
  const pmConfig =
    PACKAGE_MANAGER_DAEMON_CONFIG[config.application?.packageManager?.name];
  if (!pmConfig) return null;
  const starter = WELL_KNOWN_STARTERS.find((s) => scripts.includes(s));
  if (!starter) return null;
  const full = `${config.application?.runtime?.pathPrefix}cd ${config.appRoot} && ${envPrefix}${pmConfig.runPrefix} ${starter}`;
  pm.run(starter, full, `$ ${pmConfig.runPrefix} ${starter}`);
  return starter;
}

import { PACKAGE_MANAGER_DAEMON_CONFIG } from "../constants";
import type { Config } from "../types";
import { spawnShell } from "./spawn-shell";

export interface InstallDeps {
  config: Config;
  dropPrivileges?: boolean;
  onChunk: (source: "setup", data: string) => void;
}

export function spawnInstall(deps: InstallDeps): Promise<number> | null {
  const { config, dropPrivileges, onChunk } = deps;
  if (!config.packageManager) return null;
  const pmConfig = PACKAGE_MANAGER_DAEMON_CONFIG[config.packageManager];
  if (!pmConfig?.install) return null;
  const corepack =
    "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 && corepack enable && ";
  const cmd = `${config.pathPrefix}cd ${config.appRoot} && ${corepack}${pmConfig.install}`;
  onChunk("setup", `\r\n$ ${pmConfig.install}\r\n`);
  return spawnShell(cmd, { dropPrivileges, onChunk });
}

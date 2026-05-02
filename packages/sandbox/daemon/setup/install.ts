import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  DECO_UID,
  DECO_GID,
  PACKAGE_MANAGER_DAEMON_CONFIG,
} from "../constants";
import { spawnPty } from "../process/pty-spawn";
import type { Config } from "../types";

export interface InstallDeps {
  config: Config;
  dropPrivileges?: boolean;
  onChunk: (source: "setup", data: string) => void;
}

export function spawnInstall(deps: InstallDeps): Promise<number> | null {
  const { config } = deps;
  if (!config.application?.packageManager?.name) return null;
  const pmConfig =
    PACKAGE_MANAGER_DAEMON_CONFIG[config.application?.packageManager?.name];
  if (!pmConfig) return null;
  const hasManifest = pmConfig.manifests.some((file) =>
    existsSync(join(config.appRoot, file)),
  );
  if (!hasManifest) return null;
  const corepack =
    "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 && (corepack enable 2>/dev/null || true) && ";
  const cmd = `${config.application.runtime.pathPrefix}cd ${config.appRoot} && ${corepack}${pmConfig.install}`;
  deps.onChunk("setup", `\r\n$ ${pmConfig.install}\r\n`);
  return new Promise((resolve) => {
    const child = spawnPty({
      cmd,
      ...(deps.dropPrivileges ? { uid: DECO_UID, gid: DECO_GID } : {}),
    });
    child.onData((data) => deps.onChunk("setup", data));
    child.onExit((code) => resolve(code));
  });
}

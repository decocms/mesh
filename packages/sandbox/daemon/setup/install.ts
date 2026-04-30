import { spawn } from "node:child_process";
import {
  DECO_UID,
  DECO_GID,
  PACKAGE_MANAGER_DAEMON_CONFIG,
} from "../constants";
import { scriptArgs } from "../process/script-args";
import type { Config } from "../types";

export interface InstallDeps {
  config: Config;
  dropPrivileges?: boolean;
  onChunk: (source: "setup", data: string) => void;
}

export function spawnInstall(deps: InstallDeps): Promise<number> | null {
  const { config } = deps;
  if (!config.packageManager) return null;
  const pmConfig = PACKAGE_MANAGER_DAEMON_CONFIG[config.packageManager];
  if (!pmConfig) return null;
  const corepack =
    "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 && (corepack enable 2>/dev/null || true) && ";
  const cmd = `${config.pathPrefix}cd ${config.appRoot} && ${corepack}${pmConfig.install}`;
  deps.onChunk("setup", `\r\n$ ${pmConfig.install}\r\n`);
  return new Promise((resolve) => {
    const opts: Parameters<typeof spawn>[2] = {
      stdio: ["ignore", "pipe", "pipe"],
    };
    if (deps.dropPrivileges) {
      (opts as { uid: number; gid: number }).uid = DECO_UID;
      (opts as { uid: number; gid: number }).gid = DECO_GID;
    }
    const child = spawn("script", scriptArgs(cmd), opts);
    child.stdout?.on("data", (c: Buffer) =>
      deps.onChunk("setup", c.toString("utf-8")),
    );
    child.stderr?.on("data", (c: Buffer) =>
      deps.onChunk("setup", c.toString("utf-8")),
    );
    child.on("error", (err) => {
      deps.onChunk("setup", `\r\nSpawn failed: ${err.message}\r\n`);
      resolve(-1);
    });
    child.on("close", (code) => resolve(code ?? -1));
  });
}

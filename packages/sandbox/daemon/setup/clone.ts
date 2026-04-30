import { spawn } from "node:child_process";
import { DECO_UID, DECO_GID } from "../constants";
import type { Config } from "../types";

export interface CloneDeps {
  config: Config;
  dropPrivileges?: boolean;
  onChunk: (source: "setup", data: string) => void;
}

/** Resolves to exit code (0 on success). Emits chunks via `onChunk`. */
export function spawnClone(deps: CloneDeps): Promise<number> {
  const { config } = deps;
  const cmd = `git clone --depth 1 ${config.cloneUrl} ${config.appRoot}`;
  const label = `$ git clone --depth 1 ${config.repoName} ${config.appRoot}`;
  deps.onChunk("setup", `${label}\r\n`);

  return new Promise((resolve) => {
    const opts: Parameters<typeof spawn>[2] = {
      stdio: ["ignore", "pipe", "pipe"],
    };
    if (deps.dropPrivileges) {
      (opts as { uid: number; gid: number }).uid = DECO_UID;
      (opts as { uid: number; gid: number }).gid = DECO_GID;
    }
    const child = spawn("sh", ["-c", cmd], opts);
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

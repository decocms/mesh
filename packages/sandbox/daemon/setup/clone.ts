import { DECO_UID, DECO_GID } from "../constants";
import { spawnPty } from "../process/pty-spawn";
import type { Config } from "../types";

export interface CloneDeps {
  config: Config;
  dropPrivileges?: boolean;
  onChunk: (source: "setup", data: string) => void;
}

/** Resolves to exit code (0 on success). Emits chunks via `onChunk`. */
export function spawnClone(deps: CloneDeps): Promise<number> {
  const { config } = deps;
  // -c safe.directory=* applied per-invocation (see setup/git.ts).
  const cmd = `git -c safe.directory='*' clone --depth 1 ${config.cloneUrl} ${config.appRoot}`;
  const label = `$ git clone --depth 1 ${config.repoName} ${config.appRoot}`;
  deps.onChunk("setup", `${label}\r\n`);

  return new Promise((resolve) => {
    const child = spawnPty({
      cmd,
      ...(deps.dropPrivileges ? { uid: DECO_UID, gid: DECO_GID } : {}),
    });
    child.onData((data) => deps.onChunk("setup", data));
    child.onExit((code) => resolve(code));
  });
}

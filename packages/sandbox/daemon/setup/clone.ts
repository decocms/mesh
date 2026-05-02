import { DECO_GID, DECO_UID } from "../constants";
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
  const cloneUrl = config.git?.repository?.cloneUrl;
  const repoLabel = config.git?.repository?.repoName ?? cloneUrl ?? "<repo>";
  if (!cloneUrl) {
    return Promise.resolve(1);
  }
  const cmd = `git -c safe.directory='*' clone --depth 1 ${cloneUrl} ${config.appRoot}`;
  const label = `$ git clone --depth 1 ${repoLabel} ${config.appRoot}`;
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

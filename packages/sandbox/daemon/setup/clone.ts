import type { Config } from "../types";
import { spawnSetupStep } from "./spawn-step";

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
  const cmd = `git -c safe.directory='*' clone --depth 1 ${cloneUrl} ${config.repoDir}`;
  const label = `$ git clone --depth 1 ${repoLabel} ${config.repoDir}`;
  deps.onChunk("setup", `${label}\r\n`);

  return spawnSetupStep(cmd, deps.onChunk, deps.dropPrivileges);
}

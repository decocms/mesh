import { existsSync, readdirSync } from "node:fs";
import type { Config } from "../types";
import { spawnSetupStep } from "./spawn-step";

export interface CloneDeps {
  config: Config;
  dropPrivileges?: boolean;
  onChunk: (source: "setup", data: string) => void;
}

/**
 * Returns true when `dir` exists, has files, but has no `.git` directory.
 * This happens when the daemon wrote `.decocms/daemon.json` into repoDir
 * before the first clone — git refuses to clone into a non-empty target, so
 * we need a different strategy (init + fetch) in that case.
 */
function isNonEmptyWithoutGit(dir: string): boolean {
  if (!existsSync(dir)) return false;
  try {
    const entries = readdirSync(dir);
    return entries.length > 0 && !entries.includes(".git");
  } catch {
    return false;
  }
}

function runStep(cmd: string, deps: CloneDeps): Promise<number> {
  deps.onChunk("setup", `$ ${cmd}\r\n`);
  return spawnSetupStep(cmd, deps.onChunk, deps.dropPrivileges);
}

/** Resolves to exit code (0 on success). Emits chunks via `onChunk`. */
export async function spawnClone(deps: CloneDeps): Promise<number> {
  const { config } = deps;
  const cloneUrl = config.git?.repository?.cloneUrl;
  if (!cloneUrl) {
    return 1;
  }
  if (!config.repoDir || !config.repoDir.startsWith("/")) {
    deps.onChunk(
      "setup",
      `\r\n[clone] repoDir is not an absolute path (got: ${String(config.repoDir)}) — aborting clone to prevent relative-path mishap\r\n`,
    );
    return 1;
  }

  const gc = `git -c safe.directory='*' -c credential.helper=`;
  const dir = config.repoDir;

  // When repoDir already has files (e.g. .decocms/daemon.json written before
  // the first clone) but no .git, `git clone` would fail with "already exists
  // and is not an empty directory". Use init+fetch+checkout instead — it
  // operates in-place and tolerates existing content.
  if (isNonEmptyWithoutGit(dir)) {
    const steps = [
      `${gc} -C ${dir} init`,
      `${gc} -C ${dir} remote add origin ${cloneUrl}`,
      `${gc} -C ${dir} fetch --depth 1 origin HEAD`,
      `${gc} -C ${dir} checkout FETCH_HEAD`,
    ];
    for (const step of steps) {
      const code = await runStep(step, deps);
      if (code !== 0) return code;
    }
    return 0;
  }

  return runStep(`${gc} clone --depth 1 ${cloneUrl} ${dir}`, deps);
}

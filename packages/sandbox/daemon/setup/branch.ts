import type { GitSyncOpts } from "../git/git-sync";
import { gitSync as defaultGitSync } from "../git/git-sync";
import type { Config } from "../types";

export interface ResolveBranchDeps {
  config: Config;
  gitSync?: (args: string[], opts: GitSyncOpts) => string;
}

export function resolveBranch(deps: ResolveBranchDeps): void {
  const rawSync = deps.gitSync ?? defaultGitSync;
  // Per-invocation safe.directory=* — option (c) from SPEC-daemon-bootstrap.md.
  const gitSync = (args: string[], opts: GitSyncOpts) =>
    rawSync(["-c", "safe.directory=*", ...args], opts);
  const { appRoot, branch } = deps.config;
  if (!branch) return;

  let branchOnRemote = false;
  try {
    gitSync(
      [
        "fetch",
        "origin",
        `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
      ],
      { cwd: appRoot },
    );
    gitSync(["fetch", "origin", `${branch}:${branch}`], { cwd: appRoot });
    branchOnRemote = true;
  } catch {
    /* Branch not on remote — create locally. */
  }

  if (branchOnRemote) {
    gitSync(["checkout", branch], { cwd: appRoot });
    return;
  }
  try {
    gitSync(["checkout", branch], { cwd: appRoot });
  } catch {
    gitSync(["checkout", "-b", branch], { cwd: appRoot });
  }
}

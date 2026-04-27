import { gitSync } from "../git/git-sync";
import type { Config } from "../types";

/** Sets system-level `safe.directory` (as root) + user.name/user.email (as deco). */
export function configureGitIdentity(config: Config): void {
  try {
    gitSync(["config", "--system", "--add", "safe.directory", config.appRoot], {
      cwd: config.appRoot,
      asUser: false,
    });
  } catch {
    // Best-effort: CI container may not allow system config edits; git still
    // works via /etc/gitconfig entries inherited from the image.
  }
  if (!config.gitUserName || !config.gitUserEmail) return;
  gitSync(["config", "user.name", config.gitUserName], {
    cwd: config.appRoot,
  });
  gitSync(["config", "user.email", config.gitUserEmail], {
    cwd: config.appRoot,
  });
}

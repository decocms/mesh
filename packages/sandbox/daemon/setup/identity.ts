import type { Config } from "../types";
import { git } from "./git";

/**
 * Sets per-tenant `user.name`/`user.email` once the repo is on disk.
 *
 * Phase 1 dropped the `git config --system --add safe.directory` call: it
 * wrote to `/etc/gitconfig` which fails silently on read-only rootfs, and
 * the per-invocation `-c safe.directory=*` (see setup/git.ts) covers the
 * dubious-ownership case order-independently.
 */
export function configureGitIdentity(config: Config): void {
  if (!config.gitUserName || !config.gitUserEmail) return;
  git(["config", "user.name", config.gitUserName], {
    cwd: config.appRoot,
  });
  git(["config", "user.email", config.gitUserEmail], {
    cwd: config.appRoot,
  });
}

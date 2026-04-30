import { gitSync, type GitSyncOpts } from "../git/git-sync";

/**
 * Per-invocation `-c safe.directory=*` wrapper. Avoids global git-config
 * mutation (option (c) in SPEC-daemon-bootstrap.md): order-independent,
 * survives read-only rootfs, and tolerates arbitrary preexisting workdir
 * ownership (e.g. chowned emptyDir, mounted PVC). Must be used for every
 * git invocation the daemon issues.
 */
export function git(args: string[], opts: GitSyncOpts): string {
  return gitSync(["-c", "safe.directory=*", ...args], opts);
}

/** Build the `git ... -c safe.directory=*` argv for use with `child_process.spawn`. */
export function buildGitArgs(args: string[]): string[] {
  return ["-c", "safe.directory=*", ...args];
}

import { hasGitRepo } from "../paths";

/** Returns true if `<repoDir>/.git` exists (daemon is resuming after restart). */
export function isResume(repoDir: string): boolean {
  return hasGitRepo(repoDir);
}

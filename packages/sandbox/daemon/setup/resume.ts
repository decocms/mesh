import fs from "node:fs";

/** Returns true if `<repoDir>/.git` exists (daemon is resuming after restart). */
export function isResume(repoDir: string): boolean {
  try {
    return fs.existsSync(`${repoDir}/.git`);
  } catch {
    return false;
  }
}

import fs from "node:fs";

/** Returns true if `<appRoot>/.git` exists (daemon is resuming after restart). */
export function isResume(appRoot: string): boolean {
  try {
    return fs.existsSync(`${appRoot}/.git`);
  } catch {
    return false;
  }
}

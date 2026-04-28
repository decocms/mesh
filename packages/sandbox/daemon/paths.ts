import path from "node:path";

/** Resolves `userPath` against `appRoot`; returns null if it escapes. */
export function safePath(appRoot: string, userPath: string): string | null {
  const resolved = path.resolve(appRoot, userPath);
  if (!resolved.startsWith(`${appRoot}/`) && resolved !== appRoot) {
    return null;
  }
  return resolved;
}

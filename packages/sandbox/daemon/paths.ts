import path from "node:path";

/**
 * Resolves `userPath` relative to `baseDir`, then enforces that the result
 * stays inside `workspaceRoot`. Returns null on escape.
 *
 * `baseDir` is typically the repo (`<workspaceRoot>/app`) so the LLM's
 * relative paths match what `bash` sees as cwd. The clamp is `workspaceRoot`
 * so paths like `../tmp/app/dev` (siblings of the repo, still inside the
 * workspace) resolve correctly.
 */
export function safePath(
  workspaceRoot: string,
  baseDir: string,
  userPath: string,
): string | null {
  const resolved = path.resolve(baseDir, userPath);
  if (!resolved.startsWith(`${workspaceRoot}/`) && resolved !== workspaceRoot) {
    return null;
  }
  return resolved;
}

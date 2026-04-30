/**
 * Build platform-correct args for `script(1)` so we can run a command
 * under a pseudo-terminal on either GNU/Linux or BSD/macOS.
 *
 * - GNU `script`: `script [-q] -c <cmd> <file>` — `-c` takes a shell string.
 * - BSD `script` (macOS): `script [-q] <file> <command> [args...]` — no
 *   `-c` flag; the command is passed as positional args. We wrap it in
 *   `sh -c <cmd>` so the caller can keep using a single shell string
 *   shape on both platforms.
 */
export function scriptArgs(cmd: string): string[] {
  if (process.platform === "darwin") {
    return ["-q", "/dev/null", "sh", "-c", cmd];
  }
  return ["-q", "-c", cmd, "/dev/null"];
}

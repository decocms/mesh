import { spawn } from "node:child_process";
import { DECO_UID, DECO_GID } from "../constants";

export interface SpawnShellOpts {
  dropPrivileges?: boolean;
  onChunk: (source: "setup", data: string) => void;
}

const EXIT_SENTINEL = "__DAEMON_EXIT__:";
const EXIT_RE = /\r?\n?__DAEMON_EXIT__:(\d+)\r?\n?/;

/**
 * Runs `cmd` inside `script -q -c … /dev/null` to get PTY output (so tools
 * like git print coloured progress) while still returning the real exit code.
 *
 * `script` on this Debian image always exits 0 regardless of the wrapped
 * command's status. We work around this by appending `; echo __DAEMON_EXIT__:$?`
 * so the real code travels through the output stream, then strip the sentinel
 * before broadcasting chunks to the caller.
 */
export function spawnShell(cmd: string, opts: SpawnShellOpts): Promise<number> {
  const { dropPrivileges, onChunk } = opts;

  const spawnOpts: Parameters<typeof spawn>[2] = {
    stdio: ["ignore", "pipe", "pipe"],
  };
  if (dropPrivileges) {
    (spawnOpts as { uid: number; gid: number }).uid = DECO_UID;
    (spawnOpts as { uid: number; gid: number }).gid = DECO_GID;
  }

  // Append exit-code sentinel so the real status survives script's exit(0).
  const wrapped = `${cmd}; echo ${EXIT_SENTINEL}$?`;

  return new Promise((resolve) => {
    let capturedCode: number | null = null;
    let tail = "";

    function flush(text: string, final = false) {
      // Buffer incomplete last lines across chunks so the sentinel is never
      // split across two data events.
      const combined = tail + text;
      const match = EXIT_RE.exec(combined);
      if (match) {
        capturedCode = parseInt(match[1], 10);
        const clean =
          combined.slice(0, match.index) +
          combined.slice(match.index + match[0].length);
        if (clean) onChunk("setup", clean);
        tail = "";
      } else if (final) {
        if (combined) onChunk("setup", combined);
        tail = "";
      } else {
        // Keep the last partial line buffered in case the sentinel straddles chunks.
        const lastNl = combined.lastIndexOf("\n");
        if (lastNl >= 0) {
          onChunk("setup", combined.slice(0, lastNl + 1));
          tail = combined.slice(lastNl + 1);
        } else {
          tail = combined;
        }
      }
    }

    const child = spawn(
      "script",
      ["-q", "-c", wrapped, "/dev/null"],
      spawnOpts,
    );
    child.stdout?.on("data", (c: Buffer) => flush(c.toString("utf-8")));
    child.stderr?.on("data", (c: Buffer) => flush(c.toString("utf-8")));
    child.on("error", (err) => {
      onChunk("setup", `\r\nSpawn failed: ${err.message}\r\n`);
      resolve(-1);
    });
    child.on("close", () => {
      flush("", true);
      resolve(capturedCode ?? -1);
    });
  });
}

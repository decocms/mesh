import os from "node:os";
import path from "node:path";
import type { ClaudeCodeCredsSource } from "mesh-plugin-user-sandbox/creds/claude-code";

/**
 * Pick the default location of Claude Code OAuth credentials for this host.
 *
 *  1. `MESH_CLAUDE_CODE_CREDS_PATH` env var wins always. Use this when mesh
 *     runs under a service account that can't read the installing user's
 *     `~/.claude/.credentials.json` — point it at a copy the service
 *     account owns.
 *  2. On darwin, the CLI stores creds in the macOS login keychain under
 *     the service "Claude Code-credentials", keyed by local username.
 *  3. Everywhere else (Linux, Windows), fall back to the file form at
 *     `$HOME/.claude/.credentials.json`.
 */
export function defaultClaudeCodeCredsSource(): ClaudeCodeCredsSource {
  const envPath = process.env.MESH_CLAUDE_CODE_CREDS_PATH;
  if (envPath && envPath.length > 0) {
    return { kind: "file", path: envPath };
  }
  if (process.platform === "darwin") {
    return { kind: "keychain", account: os.userInfo().username };
  }
  return {
    kind: "file",
    path: path.join(os.homedir(), ".claude", ".credentials.json"),
  };
}

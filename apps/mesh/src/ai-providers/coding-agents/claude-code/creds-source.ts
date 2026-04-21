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
 *
 * The result is the **mesh host user's** Anthropic OAuth token — fine on
 * localhost self-host where the studio user is the same person as the
 * mesh host user, so shipping it into their own sandbox changes nothing
 * that `claude` on the host wouldn't already expose.
 *
 * This path is intentionally local-only. Prod uses the KubernetesSandboxRunner
 * (see `packages/mesh-plugin-user-sandbox/PLAN.md`), which injects per-user
 * credentials per `/bash` exec and never ships a host token into a shared
 * pod. The opt-in env `MESH_SANDBOX_ALLOW_OPERATOR_CLAUDE_CREDS=1` is the
 * explicit acknowledgement that this is a localhost self-host deployment —
 * without it, the sandbox claude-code branch refuses and the turn falls back
 * to local spawn. See `isOperatorClaudeCredsAllowedInSandbox` for the gate.
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

/**
 * Require `MESH_SANDBOX_ALLOW_OPERATOR_CLAUDE_CREDS=1` as an explicit
 * acknowledgement that this is a localhost self-host deployment where the
 * studio user is the mesh host user — so shipping their own Anthropic OAuth
 * token into their own sandbox is a no-op on the existing trust boundary.
 *
 * Without the env set, the sandbox claude-code branch refuses and the turn
 * falls back to local spawn. Prod never takes this path (KubernetesSandboxRunner
 * will inject per-user creds per exec — see PLAN.md).
 */
export function isOperatorClaudeCredsAllowedInSandbox(): boolean {
  return process.env.MESH_SANDBOX_ALLOW_OPERATOR_CLAUDE_CREDS === "1";
}

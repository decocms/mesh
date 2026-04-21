export const PLUGIN_ID = "MCP User Sandbox";
export const PLUGIN_DESCRIPTION =
  "Isolated per-user sandboxes for MCP tool execution";

export const DAEMON_PORT = 9000;
export const DEFAULT_IMAGE = "mesh-sandbox:local";
/**
 * Variant of DEFAULT_IMAGE with the Claude Code CLI pre-baked. Used by the
 * decopilot claude-code sandbox path when no prep image exists, so the first
 * turn doesn't pay the CLI install cost. Build:
 *   docker build -t mesh-sandbox:claude -f Dockerfile.claude image/
 */
export const CLAUDE_IMAGE = "mesh-sandbox:claude";

/**
 * Pinned Claude Code CLI version. Must match whichever tag the baked image
 * was built with (see Dockerfile.claude).
 */
export const CLAUDE_CODE_CLI_VERSION = "2.1.116";

/** Shell-quote a value for safe inclusion in a `bash -lc` script. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Shell snippet that sets global git identity. Prepend to any shell script
 * that then clones a repo — the per-call-site clone strategy (empty-dir,
 * backup-then-clone, tmp-fallback) is owned by the caller since they differ
 * meaningfully.
 */
export function gitIdentityScript(userName: string, userEmail: string): string {
  return `git config --global user.name ${shellQuote(userName)} && git config --global user.email ${shellQuote(userEmail)}`;
}

/**
 * Constants and env-derived config for the sandbox daemon. No side effects
 * except the fatal exit when DAEMON_TOKEN is missing — every route is bearer-
 * authed against it, so booting without one would let anything in the
 * container talk to the daemon.
 */

export const PORT = Number(process.env.DAEMON_PORT ?? 9000);
export const TOKEN = process.env.DAEMON_TOKEN;
export const WORKDIR = process.env.WORKDIR ?? "/app";

export const DENO_INSTALL_DIR = "/opt/deno";
export const DENO_BIN = `${DENO_INSTALL_DIR}/bin/deno`;

// Claude Code CLI is lazy-installed by /claude-code/query on first use. Stays
// in lockstep with the pinned constant in shared.ts — bump both (and the
// translator fixtures) in the same PR.
export const CLAUDE_CODE_VERSION = process.env.CLAUDE_CODE_VERSION ?? "2.1.116";
export const CLAUDE_BIN = "/usr/local/bin/claude";
export const CLAUDE_CREDS_PATH = "/root/.claude/.credentials.json";

// Optional HTML snippet injected before `</body>` on proxied HTML responses.
// Mesh populates this via `-e DAEMON_BOOTSTRAP=...` when it owns the preview
// URL (HMR wiring, iframe bootstrap). Empty string → no injection.
export const BOOTSTRAP = process.env.DAEMON_BOOTSTRAP ?? "";

// SSE subscriber cap. A runaway reconnecting client shouldn't be able to
// exhaust the daemon's sockets; mesh never opens more than one per viewer.
export const MAX_SSE_CLIENTS = 10;

export const LOG_RING_CAP = 2000;
export const DAEMON_LOG_CAP = 500;

export const FAST_CRASH_MS = 10_000;
export const MAX_BACKOFF_MS = 60_000;

if (!TOKEN) {
  console.error("[sandbox-daemon] DAEMON_TOKEN not set; refusing to start");
  process.exit(1);
}

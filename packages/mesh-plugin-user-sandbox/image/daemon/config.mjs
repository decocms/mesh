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

// SSE subscriber cap. A runaway reconnecting client shouldn't be able to
// exhaust the daemon's sockets; mesh never opens more than one per viewer.
export const MAX_SSE_CLIENTS = 10;

export const LOG_RING_CAP = 2000;

export const FAST_CRASH_MS = 10_000;
export const MAX_BACKOFF_MS = 60_000;

// Rolling-window rate limit for auto-respawn after clean self-exits
// (Deno --unstable-hmr, Fresh, bun --hot, vite — all restart the dev
// process on file change and expect the supervisor to bring it back).
// The cap only fires for pathological loops (scripts that exit 0 every
// few hundred ms); normal LLM-driven rapid editing stays well below it.
export const RESPAWN_WINDOW_MS = 60_000;
export const RESPAWN_MAX_IN_WINDOW = 20;

// The dev server must bind this port inside the container. Pods expose it
// externally — the daemon does not proxy dev traffic.
export const DEV_PORT = 3000;

if (!TOKEN) {
  console.error("[sandbox-daemon] DAEMON_TOKEN not set; refusing to start");
  process.exit(1);
}

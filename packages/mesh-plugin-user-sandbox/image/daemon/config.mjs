// DAEMON_TOKEN is mandatory: every route is bearer-authed against it, so
// booting without one would let anything in the container talk to the daemon.

export const PORT = Number(process.env.DAEMON_PORT ?? 9000);
export const TOKEN = process.env.DAEMON_TOKEN;
export const WORKDIR = process.env.WORKDIR ?? "/app";

export const DENO_BIN = "/opt/deno/bin/deno";

/** DAEMON_TOKEN stripped — must never leak to user code. */
export function childEnv(extra) {
  const env = { ...process.env, ...(extra ?? {}) };
  delete env.DAEMON_TOKEN;
  return env;
}

export const MAX_SSE_CLIENTS = 10;

export const LOG_RING_CAP = 2000;
export const LOG_RING_BYTES_CAP = 2 * 1024 * 1024; // 2 MiB

export const FAST_CRASH_MS = 10_000;
export const MAX_BACKOFF_MS = 60_000;

// Dev server must bind this port; pods expose it externally (no proxying).
export const DEV_PORT = 3000;

if (!TOKEN) {
  console.error("[sandbox-daemon] DAEMON_TOKEN not set; refusing to start");
  process.exit(1);
}

/**
 * Single dev-server state container. Pod-per-thread — one daemon, one dev
 * process, no fanout.
 *
 * State only — the transition helpers (setPhase, currentStatusPayload) and
 * the log ring live in `events.mjs` since they broadcast over SSE on every
 * update.
 */

import { MAX_BACKOFF_MS, WORKDIR } from "./config.mjs";

export const dev = {
  cwd: WORKDIR,
  /** idle | installing | starting | ready | exited | crashed */
  phase: "idle",
  pid: null,
  exitCode: null,
  pm: null,
  script: null,
  startedAt: null,
  child: null,
  stopInFlight: null,
  /** { source, line, ts } — shared log ring across all sources. */
  logRing: [],
  // Crash-loop backoff: consecutive fast crashes (exit < FAST_CRASH_MS after
  // spawn) accumulate here. `/dev/start` refuses until the computed backoff
  // window elapses, so a persistent startup failure (missing dep, bad
  // config) doesn't turn into hundreds of respawns driven by UI polling.
  // Cleared on `ready` and on `restart: true`.
  crashCount: 0,
  lastCrashAt: null,
};

function computeCrashBackoffMs() {
  if (!dev.crashCount) return 0;
  return Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (dev.crashCount - 1));
}

export function crashBackoffRemainingMs() {
  if (!dev.crashCount || !dev.lastCrashAt) return 0;
  const elapsed = Date.now() - dev.lastCrashAt;
  const backoff = computeCrashBackoffMs();
  return Math.max(0, backoff - elapsed);
}

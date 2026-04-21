/**
 * Per-thread dev-server state container.
 *
 * Each thread ID maps to an independent DevState. When no `threadId` is
 * supplied by the caller (legacy single-dev path) we fall back to the
 * DEFAULT_THREAD key so old callers keep working.
 *
 * State only — the transition helpers (setPhase, currentStatusPayload) and
 * the log ring live in `events.mjs` since they broadcast over SSE on every
 * update.
 */

import { MAX_BACKOFF_MS, WORKDIR } from "./config.mjs";

export const DEFAULT_THREAD = "_default";

/** Map<threadKey, DevState> */
export const devByThread = new Map();

/**
 * Set of ports currently bound by a dev child across all threads. The port-
 * poll loop excludes these from its candidate set so two near-simultaneous
 * starts don't fight over the same LISTEN port.
 */
export const ownedPorts = new Set();

export function makeDevState(key) {
  return {
    threadId: key,
    cwd: WORKDIR,
    phase: "idle", // idle | installing | starting | ready | exited | crashed
    pid: null,
    exitCode: null,
    port: null,
    pm: null,
    script: null,
    baselinePorts: new Set(),
    startedAt: null,
    preferredPort: null,
    child: null,
    portPollTimer: null,
    stopInFlight: null,
    logRing: [], // { source, line, ts }
    // Crash-loop backoff: consecutive fast crashes (exit < FAST_CRASH_MS
    // after spawn) accumulate here. `/dev/start` refuses until the
    // computed backoff window elapses, so a persistent startup failure
    // (missing dep, bad config) doesn't turn into hundreds of respawns
    // driven by UI polling. Cleared on `ready` and on `restart: true`.
    crashCount: 0,
    lastCrashAt: null,
  };
}

export function getDev(threadId) {
  const key = threadId || DEFAULT_THREAD;
  let dev = devByThread.get(key);
  if (!dev) {
    dev = makeDevState(key);
    devByThread.set(key, dev);
  }
  return dev;
}

export function computeCrashBackoffMs(dev) {
  if (!dev.crashCount) return 0;
  return Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (dev.crashCount - 1));
}

export function crashBackoffRemainingMs(dev) {
  if (!dev.crashCount || !dev.lastCrashAt) return 0;
  const elapsed = Date.now() - dev.lastCrashAt;
  const backoff = computeCrashBackoffMs(dev);
  return Math.max(0, backoff - elapsed);
}

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
  // Consecutive fast crashes; /dev/start refuses until backoff elapses.
  // Cleared on `ready` and on `restart: true`.
  crashCount: 0,
  lastCrashAt: null,
  // Rolling timestamps to detect pathological clean-exit loops.
  respawnTimes: [],
  // Set by stopDev() before SIGTERM so the exit handler skips auto-respawn.
  stopRequested: false,
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

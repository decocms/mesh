/**
 * Log ring, SSE fan-out, and dev-phase transitions. Pod-per-thread → one ring
 * per daemon, one SSE stream, no per-thread filtering.
 */

import { LOG_RING_CAP } from "./config.mjs";
import { crashBackoffRemainingMs, dev } from "./dev-state.mjs";
import { inspectWorkdir } from "./workdir.mjs";

/** Set<res> — active SSE subscribers. */
export const subscribers = new Set();

export function appendLog(source, chunk) {
  const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0 && i === lines.length - 1) continue;
    const entry = { source, line, ts: Date.now() };
    dev.logRing.push(entry);
    if (dev.logRing.length > LOG_RING_CAP) dev.logRing.shift();
    broadcast("log", { source, data: line + "\n" });
    console.log(`[${source}] ${line}`);
  }
}

function broadcast(event, payload) {
  const line = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of subscribers) {
    try {
      res.write(line);
    } catch {
      subscribers.delete(res);
    }
  }
}

export function currentStatusPayload() {
  return {
    ready: dev.phase === "ready",
    phase: dev.phase,
    pid: dev.pid,
    pm: dev.pm,
    script: dev.script,
    exitCode: dev.exitCode,
    cwd: dev.cwd,
    // Non-zero when a fast-crash streak is active. Callers that auto-poke
    // `/dev/start` on crashed phase should skip while this is > 0; bypass
    // with `{ restart: true }` to force a manual retry.
    crashBackoffRemainingMs: crashBackoffRemainingMs(),
    crashCount: dev.crashCount,
  };
}

/**
 * Ask subscribed preview iframes to reload themselves. Used by the deco
 * watcher for block/metadata JSON changes — edits Deno HMR won't see, so
 * nothing else would trigger a reload.
 */
export function emitReload(reason) {
  broadcast("reload", { reason, ts: Date.now() });
}

export function setPhase(next) {
  if (dev.phase === next) return;
  dev.phase = next;
  // Success clears the crash-loop streak so the next bad start gets a full
  // backoff budget instead of immediately hitting the cap.
  if (next === "ready") {
    dev.crashCount = 0;
    dev.lastCrashAt = null;
  }
  broadcast("status", currentStatusPayload());
  broadcast("processes", { active: dev.pid ? [String(dev.pid)] : [] });
}

export function readLogs(source) {
  if (!source) return dev.logRing;
  return dev.logRing.filter((e) => e.source === source);
}

/** Emit initial status/scripts/processes/log tail to a new SSE subscriber. */
export function replayTo(res) {
  res.write(
    `event: status\ndata: ${JSON.stringify(currentStatusPayload())}\n\n`,
  );
  res.write(
    `event: scripts\ndata: ${JSON.stringify({
      scripts: inspectWorkdir(dev.cwd).scripts,
    })}\n\n`,
  );
  res.write(
    `event: processes\ndata: ${JSON.stringify({
      active: dev.pid ? [String(dev.pid)] : [],
    })}\n\n`,
  );
  const tail = dev.logRing.slice(-200);
  for (const entry of tail) {
    res.write(
      `event: log\ndata: ${JSON.stringify({
        source: entry.source,
        data: entry.line + "\n",
      })}\n\n`,
    );
  }
}

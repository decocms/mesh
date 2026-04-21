/**
 * Log rings, SSE fan-out, and dev-phase transitions.
 *
 * Two log rings: a shared `daemonLogRing` for events that aren't tied to any
 * one thread (container setup, claude-code invocations, daemon lifecycle),
 * and per-thread rings on each DevState. Merge reads so a thread-scoped
 * viewer still sees setup/install chatter that happened before its dev
 * process spawned.
 */

import { DAEMON_LOG_CAP, LOG_RING_CAP, WORKDIR } from "./config.mjs";
import {
  DEFAULT_THREAD,
  crashBackoffRemainingMs,
  devByThread,
  getDev,
} from "./dev-state.mjs";
import { inspectWorkdir } from "./workdir.mjs";

const daemonLogRing = []; // { source, line, ts }

/** Map<res, { threadId: string | null }> */
export const subscribers = new Map();

function shortTid(tid) {
  return tid.replace(/^thrd_/, "").slice(0, 8);
}

export function appendLog(source, chunk, threadId) {
  const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0 && i === lines.length - 1) continue;
    const entry = { source, line, ts: Date.now() };
    if (threadId) {
      const dev = getDev(threadId);
      dev.logRing.push(entry);
      if (dev.logRing.length > LOG_RING_CAP) dev.logRing.shift();
    } else {
      daemonLogRing.push(entry);
      if (daemonLogRing.length > DAEMON_LOG_CAP) daemonLogRing.shift();
    }
    broadcast("log", { source, data: line + "\n" }, threadId ?? null);
    // Mirror to stdout with a short thread tag so `docker logs` stays
    // greppable per thread when multiple dev processes are running.
    const tag =
      threadId && threadId !== DEFAULT_THREAD
        ? `${source}/${shortTid(threadId)}`
        : source;
    console.log(`[${tag}] ${line}`);
  }
}

/**
 * Fan out an event. `threadId === null` → daemon-wide (claude-code, boot
 * chatter): every subscriber gets it. A string `threadId` is scoped: only
 * subscribers registered on that thread receive it.
 */
function broadcast(event, payload, threadId) {
  const tid = threadId ?? null;
  const envelope =
    payload && typeof payload === "object"
      ? { ...payload, threadId: tid }
      : { value: payload, threadId: tid };
  const line = `event: ${event}\ndata: ${JSON.stringify(envelope)}\n\n`;
  for (const [res, meta] of subscribers) {
    if (tid !== null) {
      const subbedTid = meta.threadId ?? null;
      if (subbedTid !== tid) continue;
    }
    try {
      res.write(line);
    } catch {
      subscribers.delete(res);
    }
  }
}

export function currentStatusPayload(threadId) {
  const dev = getDev(threadId);
  return {
    ready: dev.phase === "ready",
    htmlSupport: dev.phase === "ready",
    phase: dev.phase,
    pid: dev.pid,
    port: dev.port,
    pm: dev.pm,
    script: dev.script,
    exitCode: dev.exitCode,
    threadId: dev.threadId === DEFAULT_THREAD ? null : dev.threadId,
    cwd: dev.cwd,
    // Non-zero when a fast-crash streak is active. Callers that auto-poke
    // `/dev/start` on crashed phase should skip while this is > 0; bypass
    // with `{ restart: true }` to force a manual retry.
    crashBackoffRemainingMs: crashBackoffRemainingMs(dev),
    crashCount: dev.crashCount,
  };
}

export function setPhase(dev, next) {
  if (dev.phase === next) return;
  dev.phase = next;
  // Success clears the crash-loop streak so the next bad start gets a full
  // backoff budget instead of immediately hitting the cap.
  if (next === "ready") {
    dev.crashCount = 0;
    dev.lastCrashAt = null;
  }
  const tidForBroadcast = dev.threadId === DEFAULT_THREAD ? null : dev.threadId;
  broadcast("status", currentStatusPayload(dev.threadId), tidForBroadcast);
  broadcast(
    "processes",
    { active: dev.pid ? [String(dev.pid)] : [] },
    tidForBroadcast,
  );
}

export function readMergedLogs(threadId, source) {
  const key = threadId || DEFAULT_THREAD;
  const threadRing = devByThread.get(key)?.logRing ?? [];
  const merged = [];
  for (const ring of [daemonLogRing, threadRing]) {
    for (const e of ring) {
      if (source && e.source !== source) continue;
      merged.push(e);
    }
  }
  merged.sort((a, b) => a.ts - b.ts);
  return merged;
}

/** Emit initial status/scripts/processes/log tail to a new SSE subscriber. */
export function replayTo(res, threadId) {
  const tid = threadId ?? null;
  res.write(
    `event: status\ndata: ${JSON.stringify(currentStatusPayload(threadId))}\n\n`,
  );
  const replayCwd = threadId ? getDev(threadId).cwd : WORKDIR;
  res.write(
    `event: scripts\ndata: ${JSON.stringify({
      scripts: inspectWorkdir(replayCwd).scripts,
      threadId: tid,
    })}\n\n`,
  );
  const dev = devByThread.get(threadId || DEFAULT_THREAD);
  res.write(
    `event: processes\ndata: ${JSON.stringify({
      active: dev?.pid ? [String(dev.pid)] : [],
      threadId: tid,
    })}\n\n`,
  );
  const tail = readMergedLogs(threadId, null).slice(-200);
  for (const entry of tail) {
    res.write(
      `event: log\ndata: ${JSON.stringify({
        source: entry.source,
        data: entry.line + "\n",
        threadId: tid,
      })}\n\n`,
    );
  }
}

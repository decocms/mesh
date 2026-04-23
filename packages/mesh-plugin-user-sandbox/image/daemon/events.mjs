import { LOG_RING_BYTES_CAP, LOG_RING_CAP } from "./config.mjs";
import { crashBackoffRemainingMs, dev } from "./dev-state.mjs";
import { execChildren } from "./exec-state.mjs";
import { inspectWorkdir } from "./workdir.mjs";

export const subscribers = new Set();

const backpressureCounts = new WeakMap();

export function appendLog(source, chunk) {
  const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0 && i === lines.length - 1) continue;
    const entry = { source, line, ts: Date.now() };
    dev.logRing.push(entry);
    dev.logRingBytes += entry.line.length;
    while (
      dev.logRing.length > 0 &&
      (dev.logRing.length > LOG_RING_CAP ||
        dev.logRingBytes > LOG_RING_BYTES_CAP)
    ) {
      const evicted = dev.logRing.shift();
      dev.logRingBytes -= evicted.line.length;
    }
    broadcast("log", { source, data: line + "\n" });
    console.log(`[${source}] ${line}`);
  }
}

function broadcast(event, payload) {
  const line = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of subscribers) {
    try {
      const ok = res.write(line);
      if (!ok) {
        const newCount = (backpressureCounts.get(res) ?? 0) + 1;
        if (newCount >= 2) {
          subscribers.delete(res);
          backpressureCounts.delete(res);
          try {
            res.destroy?.();
          } catch {}
        } else {
          backpressureCounts.set(res, newCount);
          if (newCount === 1) {
            res.once("drain", () => backpressureCounts.delete(res));
          }
        }
      }
    } catch {
      subscribers.delete(res);
      backpressureCounts.delete(res);
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
    // Auto-pokers must skip while > 0; bypass with `{ restart: true }`.
    crashBackoffRemainingMs: crashBackoffRemainingMs(),
    crashCount: dev.crashCount,
  };
}

/** Reload preview iframes — used for .deco JSON edits that HMR can't see. */
export function emitReload(reason) {
  broadcast("reload", { reason, ts: Date.now() });
}

/** Union of the dev server (if running) and every /exec child, by script name. */
function computeActiveProcesses() {
  const active = [];
  if (dev.pid && dev.script) active.push(dev.script);
  for (const name of execChildren.keys()) active.push(name);
  return active;
}

export function broadcastProcesses() {
  broadcast("processes", { active: computeActiveProcesses() });
}

export function setPhase(next) {
  if (dev.phase === next) return;
  dev.phase = next;
  // Reset crash streak on success so the next failure gets a full budget.
  if (next === "ready") {
    dev.crashCount = 0;
    dev.lastCrashAt = null;
  }
  broadcast("status", currentStatusPayload());
  broadcastProcesses();
}

export function readLogs(source) {
  if (!source) return dev.logRing;
  return dev.logRing.filter((e) => e.source === source);
}

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
      active: computeActiveProcesses(),
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

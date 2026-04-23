import { LOG_RING_CAP } from "./config.mjs";
import { crashBackoffRemainingMs, dev } from "./dev-state.mjs";
import { inspectWorkdir } from "./workdir.mjs";

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
    // Auto-pokers must skip while > 0; bypass with `{ restart: true }`.
    crashBackoffRemainingMs: crashBackoffRemainingMs(),
    crashCount: dev.crashCount,
  };
}

/** Reload preview iframes — used for .deco JSON edits that HMR can't see. */
export function emitReload(reason) {
  broadcast("reload", { reason, ts: Date.now() });
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
  broadcast("processes", { active: dev.pid ? [String(dev.pid)] : [] });
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

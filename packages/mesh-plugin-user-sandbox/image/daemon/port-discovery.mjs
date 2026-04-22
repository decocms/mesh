/**
 * Dev-server port discovery via /proc/net/tcp sniffing + a polling loop.
 * Avoids shelling out to netstat/ss so the base image doesn't need them.
 */

import fs from "node:fs";
import { PORT } from "./config.mjs";
import { DEFAULT_THREAD, ownedPorts } from "./dev-state.mjs";
import { appendLog, setPhase } from "./events.mjs";

/**
 * Parse `/proc/net/tcp{,6}` and return the set of ports in LISTEN (state 0A).
 */
export function snapshotListenPorts() {
  const ports = new Set();
  for (const f of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let raw;
    try {
      raw = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    const lines = raw.split("\n");
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/);
      if (parts.length < 4 || parts[3] !== "0A") continue;
      const local = parts[1];
      const colonIdx = local.lastIndexOf(":");
      if (colonIdx < 0) continue;
      const portHex = local.slice(colonIdx + 1);
      const port = parseInt(portHex, 16);
      if (Number.isFinite(port)) ports.add(port);
    }
  }
  return ports;
}

const PORT_POLL_INTERVAL_MS = 250;
const PORT_POLL_MAX_MS = 120_000;

/**
 * How long to keep polling *after* we first see a candidate port bind. Lets
 * the dev server settle on its actual listening port before we lock in —
 * relevant for projects that run more than one process (API on :8080, Vite
 * on :5173) where the wrong one may bind first. If `dev.preferredPort`
 * matches any candidate during this window, it wins.
 */
const PORT_SETTLE_MS = 1500;

export function stopPortPoll(dev) {
  if (dev.portPollTimer) {
    clearInterval(dev.portPollTimer);
    dev.portPollTimer = null;
  }
}

export function startPortPoll(dev) {
  stopPortPoll(dev);
  const started = Date.now();
  let firstCandidateAt = null;
  let firstCandidate = null;
  dev.portPollTimer = setInterval(() => {
    if (dev.phase !== "starting") {
      stopPortPoll(dev);
      return;
    }
    if (Date.now() - started > PORT_POLL_MAX_MS) {
      stopPortPoll(dev);
      appendLog(
        "daemon",
        `[sandbox-daemon] timed out waiting for dev server to bind a port\n`,
        dev.threadId === DEFAULT_THREAD ? null : dev.threadId,
      );
      return;
    }
    const candidates = [];
    for (const p of snapshotListenPorts()) {
      if (p === PORT) continue;
      if (dev.baselinePorts.has(p)) continue;
      // Exclude ports owned by another thread's dev child so simultaneous
      // starts don't cross-wire (A's poll locking onto B's Vite port). The
      // current thread's own pre-allocated port is in ownedPorts too (we
      // reserve it before spawn so siblings don't re-pick it) — whitelist
      // it so the poll can actually latch when the child binds it.
      if (ownedPorts.has(p) && p !== dev.preferredPort) continue;
      candidates.push(p);
    }
    if (candidates.length === 0) return;

    if (dev.preferredPort && candidates.includes(dev.preferredPort)) {
      dev.port = dev.preferredPort;
      ownedPorts.add(dev.port);
      setPhase(dev, "ready");
      stopPortPoll(dev);
      return;
    }

    if (firstCandidate == null) {
      firstCandidate = candidates[0];
      firstCandidateAt = Date.now();
    }
    if (!dev.preferredPort || Date.now() - firstCandidateAt >= PORT_SETTLE_MS) {
      dev.port = firstCandidate;
      ownedPorts.add(dev.port);
      setPhase(dev, "ready");
      stopPortPoll(dev);
    }
  }, PORT_POLL_INTERVAL_MS);
  dev.portPollTimer.unref?.();
}

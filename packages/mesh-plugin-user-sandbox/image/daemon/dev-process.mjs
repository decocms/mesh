/**
 * Dev-server lifecycle: install if needed, spawn the configured dev script,
 * track phases, and tear it down cleanly. Each thread owns its own child,
 * stored in the DevState.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DENO_BIN, FAST_CRASH_MS, WORKDIR } from "./config.mjs";
import {
  DEFAULT_THREAD,
  crashBackoffRemainingMs,
  devByThread,
  getDev,
  ownedPorts,
} from "./dev-state.mjs";
import { appendLog, setPhase } from "./events.mjs";
import { childEnv, ensureDenoInstalled } from "./lazy-install.mjs";
import {
  snapshotListenPorts,
  startPortPoll,
  stopPortPoll,
} from "./port-discovery.mjs";
import {
  detectPackageManager,
  detectRuntime,
  pickScript,
  readDenoConfig,
  readPackageJson,
} from "./workdir.mjs";

function killDev(dev, signal = "SIGTERM") {
  if (!dev.child || dev.child.pid == null) return;
  try {
    // Signal the script runner directly (not the process group). Runners
    // like `deno task`, `bun run`, and `pnpm run` trap SIGTERM and forward
    // it to their child; broadcasting to the pgid would signal the user's
    // server twice. `waitForExit` still escalates to a pgid SIGKILL after
    // the grace window, catching orphaned descendants on the way out.
    dev.child.kill(signal);
  } catch {}
}

async function waitForExit(dev, graceMs) {
  if (!dev.child) return;
  const child = dev.child;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
      resolve();
    }, graceMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function runInstall(cmd, args, cwd, threadId) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: childEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => appendLog("setup", d, threadId));
    child.stderr.on("data", (d) => appendLog("setup", d, threadId));
    child.on("close", (code) => resolve(code ?? -1));
    child.on("error", (err) => {
      appendLog("setup", `[install] ${String(err)}\n`, threadId);
      resolve(-1);
    });
  });
}

function hasNodeModules(workdir) {
  try {
    const entries = fs.readdirSync(path.join(workdir, "node_modules"));
    return entries.length > 0;
  } catch {
    return false;
  }
}

export async function startDev({
  threadId,
  cwd,
  script: requestedScript,
  restart,
  preferredPort,
  runtime: runtimeHint,
} = {}) {
  const key = threadId || DEFAULT_THREAD;
  const dev = getDev(key);
  const workdir =
    typeof cwd === "string" && cwd.length > 0 ? cwd : dev.cwd || WORKDIR;
  dev.cwd = workdir;

  // Broadcast threadId is null when this is the legacy/default thread so
  // callers subscribed without a threadId keep getting its events.
  const broadcastTid = key === DEFAULT_THREAD ? null : key;

  const parsedPreferred =
    preferredPort == null
      ? null
      : Number.isFinite(Number(preferredPort))
        ? Number(preferredPort)
        : null;
  dev.preferredPort = parsedPreferred;
  if (
    !restart &&
    (dev.phase === "installing" ||
      dev.phase === "starting" ||
      dev.phase === "ready")
  ) {
    return;
  }
  // Crash-loop guard: a non-forcing caller (e.g. UI polling loop) asking to
  // start during the backoff window after a fast-crash streak is refused.
  // `restart: true` bypasses so a human-triggered "restart dev server" button
  // or a code fix still works. Without this, UI polls hammer `/dev/start`
  // when the dev script has a persistent startup failure.
  if (!restart && dev.phase === "crashed") {
    const wait = crashBackoffRemainingMs(dev);
    if (wait > 0) {
      const err = new Error(
        `dev crash-loop backoff: ${dev.crashCount} consecutive fast crashes, retry in ${Math.ceil(wait / 1000)}s`,
      );
      err.code = "DEV_CRASH_LOOP";
      err.retryAfterMs = wait;
      throw err;
    }
  }
  if (restart) {
    dev.crashCount = 0;
    dev.lastCrashAt = null;
  }
  if (dev.child) await stopDev(key);

  dev.pid = null;
  if (dev.port != null) ownedPorts.delete(dev.port);
  dev.port = null;
  dev.exitCode = null;
  dev.startedAt = Date.now();

  // Caller's hint wins; otherwise sniff the workdir. Deno wins over Node
  // when both `package.json` and `deno.json` exist (common in deco-sites).
  const runtime =
    runtimeHint === "deno" || runtimeHint === "bun" || runtimeHint === "node"
      ? runtimeHint
      : detectRuntime(workdir);

  const pkg = readPackageJson(workdir);
  const denoConfig = runtime === "deno" ? readDenoConfig(workdir) : null;
  const pm = runtime === "deno" ? "deno" : detectPackageManager(workdir);
  const script = requestedScript ?? pickScript(runtime, pkg, denoConfig);
  dev.pm = pm;
  dev.script = script ?? null;

  if (!script) {
    const where = runtime === "deno" ? "deno.json tasks" : "package.json";
    appendLog(
      "daemon",
      `[sandbox-daemon] no "dev" or "start" script in ${where} (${workdir}) — cannot auto-start\n`,
      broadcastTid,
    );
    setPhase(dev, "crashed");
    return;
  }

  // Install step. For Node/Bun we gate on node_modules; for Deno we only
  // ensure the Deno binary is present — `deno task` handles module caching
  // on first run, and `deno install` semantics vary too much across versions
  // to be a reliable warm-up call here.
  if (runtime === "deno") {
    setPhase(dev, "installing");
    const ok = await ensureDenoInstalled();
    if (!ok) {
      setPhase(dev, "crashed");
      return;
    }
  } else if (!hasNodeModules(workdir)) {
    setPhase(dev, "installing");
    appendLog(
      "setup",
      `[setup] running ${pm} install in ${workdir}\n`,
      broadcastTid,
    );
    const code = await runInstall(pm, ["install"], workdir, broadcastTid);
    if (code !== 0) {
      appendLog(
        "setup",
        `[setup] ${pm} install failed (exit ${code})\n`,
        broadcastTid,
      );
      setPhase(dev, "crashed");
      return;
    }
    appendLog("setup", `[setup] ${pm} install completed\n`, broadcastTid);
  }

  // Baseline LISTEN ports BEFORE spawn so we can diff after. Merge in ports
  // owned by other threads too — this thread must only claim ports it bound
  // itself, never a sibling's.
  const baseline = snapshotListenPorts();
  for (const p of ownedPorts) baseline.add(p);
  dev.baselinePorts = baseline;
  setPhase(dev, "starting");

  // Frameworks that honor HOST (Next.js, some Vite configs) pick up 0.0.0.0
  // so discovery is snappier. Anything binding to 127.0.0.1 is still
  // reachable — the daemon proxies via loopback — so no --host trick needed.
  const env = childEnv({ HOST: process.env.HOST ?? "0.0.0.0" });

  // Wrap the real command in `script -q -c` so the child sees a PTY and its
  // output keeps ANSI colors / progress animations that frameworks emit when
  // they detect a TTY. Without this, `process.stdout.isTTY === false`
  // inside the child strips formatting and preview logs look washed out.
  // Full DENO_BIN path so PATH doesn't need /opt/deno/bin when Deno was
  // lazy-installed.
  const humanCmd =
    runtime === "deno" ? `${DENO_BIN} task ${script}` : `${pm} run ${script}`;
  const child = spawn("script", ["-q", "-c", humanCmd, "/dev/null"], {
    cwd: workdir,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  dev.child = child;
  dev.pid = child.pid ?? null;

  // Tag dev process output with the script name so the UI's per-script tab
  // (which keys off the `source` field) picks up the logs. Daemon lifecycle
  // events stay on source="daemon".
  const scriptSource = script;
  appendLog(
    "daemon",
    `[sandbox-daemon] spawned ${humanCmd} (pid ${child.pid}, cwd ${workdir})\n`,
    broadcastTid,
  );

  child.stdout.on("data", (d) => appendLog(scriptSource, d, broadcastTid));
  child.stderr.on("data", (d) => appendLog(scriptSource, d, broadcastTid));
  child.on("exit", (code, signal) => {
    dev.exitCode = code ?? null;
    appendLog(
      "daemon",
      `[sandbox-daemon] dev process exited (code=${code}, signal=${signal})\n`,
      broadcastTid,
    );
    stopPortPoll(dev);
    if (dev.port != null) {
      ownedPorts.delete(dev.port);
      dev.port = null;
    }
    if (dev.child === child) dev.child = null;
    // Fast-crash bookkeeping: only non-zero exits within FAST_CRASH_MS of
    // startup count toward the backoff streak. A dev server that ran fine
    // for an hour and then got SIGKILLed shouldn't be punished.
    if (code !== 0 && code != null) {
      const ranFor = dev.startedAt ? Date.now() - dev.startedAt : Infinity;
      if (ranFor < FAST_CRASH_MS) {
        dev.crashCount = (dev.crashCount || 0) + 1;
      } else {
        dev.crashCount = 1;
      }
      dev.lastCrashAt = Date.now();
    }
    setPhase(dev, code === 0 ? "exited" : "crashed");
    dev.pid = null;
  });
  child.on("error", (err) => {
    appendLog(
      "daemon",
      `[sandbox-daemon] spawn error: ${String(err)}\n`,
      broadcastTid,
    );
    stopPortPoll(dev);
    if (dev.port != null) {
      ownedPorts.delete(dev.port);
      dev.port = null;
    }
    if (dev.child === child) dev.child = null;
    setPhase(dev, "crashed");
    dev.pid = null;
  });

  startPortPoll(dev);
}

export async function stopDev(threadId) {
  const key = threadId || DEFAULT_THREAD;
  const dev = devByThread.get(key);
  if (!dev) return;
  if (dev.stopInFlight) return dev.stopInFlight;
  dev.stopInFlight = (async () => {
    if (!dev.child) {
      if (dev.phase === "ready" || dev.phase === "starting") {
        setPhase(dev, "exited");
      }
      return;
    }
    killDev(dev, "SIGTERM");
    await waitForExit(dev, 5_000);
    dev.child = null;
    dev.pid = null;
    if (dev.port != null) {
      ownedPorts.delete(dev.port);
      dev.port = null;
    }
    setPhase(dev, "exited");
  })();
  try {
    await dev.stopInFlight;
  } finally {
    dev.stopInFlight = null;
  }
}

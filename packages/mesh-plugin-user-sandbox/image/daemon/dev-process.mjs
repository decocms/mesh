/**
 * Dev-server lifecycle: install if needed, spawn the configured dev script,
 * track phases, and tear it down cleanly. One dev process per pod.
 *
 * The dev server MUST bind `0.0.0.0:3000` inside the container. Pods expose
 * :3000 externally (the daemon does not proxy dev traffic), so a framework
 * that ignores $PORT will leave this daemon in phase=`crashed` with a clear
 * readiness-probe timeout message.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import {
  DENO_BIN,
  DEV_PORT,
  FAST_CRASH_MS,
  RESPAWN_MAX_IN_WINDOW,
  RESPAWN_WINDOW_MS,
  WORKDIR,
  childEnv,
} from "./config.mjs";
import { crashBackoffRemainingMs, dev } from "./dev-state.mjs";
import { appendLog, setPhase } from "./events.mjs";
import {
  detectPackageManager,
  detectRuntime,
  pickScript,
  readDenoConfig,
  readPackageJson,
} from "./workdir.mjs";

const READINESS_INTERVAL_MS = 500;
const READINESS_TIMEOUT_MS = 60_000;

function killDev(signal = "SIGTERM") {
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

async function waitForExit(graceMs) {
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

function runInstall(cmd, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: childEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => appendLog("setup", d));
    child.stderr.on("data", (d) => appendLog("setup", d));
    child.on("close", (code) => resolve(code ?? -1));
    child.on("error", (err) => {
      appendLog("setup", `[install] ${String(err)}\n`);
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

/**
 * Poll the dev server's loopback port until it accepts a connection, or
 * timeout. First successful connect → phase=`ready`. Timeout → phase=`crashed`
 * with a message pointing at the bind contract.
 */
async function probeDevReady() {
  const started = Date.now();
  while (Date.now() - started < READINESS_TIMEOUT_MS) {
    if (dev.phase !== "starting") return;
    const connected = await tryConnect(DEV_PORT);
    if (connected) {
      setPhase("ready");
      return;
    }
    await sleep(READINESS_INTERVAL_MS);
  }
  if (dev.phase === "starting") {
    appendLog(
      "daemon",
      `[sandbox-daemon] dev server did not bind :${DEV_PORT} within ${READINESS_TIMEOUT_MS / 1000}s\n`,
    );
    setPhase("crashed");
  }
}

function tryConnect(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Schedule a respawn after a clean self-exit, throttled by a rolling window.
 * Handles the pathological case (a script that exits 0 every few hundred ms)
 * without ever interfering with normal HMR: 20 respawns in 60s is far beyond
 * what any real edit cadence produces — even an LLM touching 30 files in
 * rapid succession only triggers one exit per source-change batch.
 */
function scheduleAutoRespawn() {
  const now = Date.now();
  dev.respawnTimes = (dev.respawnTimes || []).filter(
    (t) => now - t < RESPAWN_WINDOW_MS,
  );
  if (dev.respawnTimes.length >= RESPAWN_MAX_IN_WINDOW) {
    appendLog(
      "daemon",
      `[sandbox-daemon] dev script exited cleanly ${dev.respawnTimes.length} times in ${RESPAWN_WINDOW_MS / 1000}s — pausing auto-respawn. This usually means the script isn't a long-running server (e.g. it forks and returns). Fix the script or POST /dev/start with {"restart":true} to retry.\n`,
    );
    dev.respawnTimes = [];
    dev.crashCount = (dev.crashCount || 0) + 1;
    dev.lastCrashAt = now;
    setPhase("crashed");
    return;
  }
  dev.respawnTimes.push(now);
  setTimeout(() => {
    if (dev.phase !== "exited") return;
    appendLog(
      "daemon",
      "[sandbox-daemon] auto-respawning dev process after clean exit\n",
    );
    startDev({ cwd: dev.cwd, script: dev.script }).catch((err) => {
      appendLog(
        "daemon",
        `[sandbox-daemon] auto-respawn failed: ${String(err)}\n`,
      );
    });
  }, 200);
}

export async function startDev({
  cwd,
  script: requestedScript,
  restart,
  runtime: runtimeHint,
} = {}) {
  const workdir =
    typeof cwd === "string" && cwd.length > 0 ? cwd : dev.cwd || WORKDIR;
  dev.cwd = workdir;

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
    const wait = crashBackoffRemainingMs();
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
    dev.respawnTimes = [];
  }
  if (dev.child) await stopDev();
  dev.stopRequested = false;

  dev.pid = null;
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
    );
    setPhase("crashed");
    return;
  }

  // Install step. Node/Bun gate on node_modules; Deno relies on `deno task`
  // handling module caching on first run (`deno install` semantics vary too
  // much across versions to be a reliable warm-up). The Deno binary ships
  // with the base image.
  if (runtime !== "deno" && !hasNodeModules(workdir)) {
    setPhase("installing");
    appendLog("setup", `[setup] running ${pm} install in ${workdir}\n`);
    const code = await runInstall(pm, ["install"], workdir);
    if (code !== 0) {
      appendLog("setup", `[setup] ${pm} install failed (exit ${code})\n`);
      setPhase("crashed");
      return;
    }
    appendLog("setup", `[setup] ${pm} install completed\n`);
  }

  setPhase("starting");

  // Hard-coded bind contract: dev server on 0.0.0.0:3000. Frameworks that
  // ignore PORT will cause the readiness probe to time out and land in
  // phase=`crashed`; the error is user-actionable (fix the script) so we
  // don't try to chase arbitrary ports.
  const env = childEnv({
    HOST: "0.0.0.0",
    PORT: String(DEV_PORT),
  });

  // Wrap the real command in `script -q -c` so the child sees a PTY and its
  // output keeps ANSI colors / progress animations that frameworks emit when
  // they detect a TTY. Without this, `process.stdout.isTTY === false`
  // inside the child strips formatting and preview logs look washed out.
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

  const scriptSource = script;
  appendLog(
    "daemon",
    `[sandbox-daemon] spawned ${humanCmd} (pid ${child.pid}, cwd ${workdir})\n`,
  );

  child.stdout.on("data", (d) => appendLog(scriptSource, d));
  child.stderr.on("data", (d) => appendLog(scriptSource, d));
  child.on("exit", (code, signal) => {
    dev.exitCode = code ?? null;
    appendLog(
      "daemon",
      `[sandbox-daemon] dev process exited (code=${code}, signal=${signal})\n`,
    );
    if (dev.child === child) dev.child = null;
    dev.pid = null;

    // stopDev() flow — we asked for the exit. Let stopDev set the final phase.
    if (dev.stopRequested) return;

    // Distinguish by intent, not by how long it ran:
    //  - clean self-exit (code=0, no signal) → runtime voluntarily stopped,
    //    almost always a watch-mode rebuild (Deno --unstable-hmr, Fresh,
    //    bun --hot, vite). Respawn immediately. An edit that lands during
    //    a cold boot is the same intent as one after 10 min of uptime —
    //    there is nothing special about the FAST_CRASH_MS boundary here.
    //  - non-zero exit or external signal → real failure, apply backoff.
    //
    // Pathological clean-exit loops (a script that exits 0 every few hundred
    // ms, e.g. an old daemonizer that forks and returns) are caught by the
    // rolling-window cap in scheduleAutoRespawn — not by a fixed timer on
    // the first exit.
    if (signal === null && code === 0) {
      setPhase("exited");
      scheduleAutoRespawn();
      return;
    }

    const ranFor = dev.startedAt ? Date.now() - dev.startedAt : Infinity;
    if (ranFor < FAST_CRASH_MS) dev.crashCount = (dev.crashCount || 0) + 1;
    else dev.crashCount = 1;
    dev.lastCrashAt = Date.now();
    setPhase("crashed");
  });
  child.on("error", (err) => {
    appendLog("daemon", `[sandbox-daemon] spawn error: ${String(err)}\n`);
    if (dev.child === child) dev.child = null;
    setPhase("crashed");
    dev.pid = null;
  });

  probeDevReady();
}

export async function stopDev() {
  if (dev.stopInFlight) return dev.stopInFlight;
  dev.stopInFlight = (async () => {
    if (!dev.child) {
      if (dev.phase === "ready" || dev.phase === "starting") {
        setPhase("exited");
      }
      return;
    }
    // Mark before killing so the exit handler won't mistake our SIGTERM for
    // a runtime crash and won't fire auto-respawn.
    dev.stopRequested = true;
    killDev("SIGTERM");
    await waitForExit(5_000);
    dev.child = null;
    dev.pid = null;
    setPhase("exited");
  })();
  try {
    await dev.stopInFlight;
  } finally {
    dev.stopInFlight = null;
  }
}

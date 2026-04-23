/**
 * Dev server MUST bind 0.0.0.0:3000; frameworks that ignore $PORT will
 * land in phase=`crashed` via readiness-probe timeout.
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
    // Signal the script runner directly, not the process group: runners
    // (deno task/bun run/pnpm run) already forward SIGTERM to their child.
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

/** Respawn after clean self-exit; rolling-window cap catches pathological loops. */
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
  // Crash-loop guard: non-forcing start during backoff is refused so UI
  // polls don't hammer /dev/start; `restart: true` bypasses for manual retry.
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

  // Hint wins; else sniff. Deno beats Node when both configs exist.
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

  // Node/Bun gate on node_modules; Deno lets `deno task` handle caching.
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

  const env = childEnv({
    HOST: "0.0.0.0",
    PORT: String(DEV_PORT),
  });

  // `script -q -c` gives the child a PTY so ANSI colors / progress output
  // that frameworks gate on isTTY survive into the log ring.
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

    // stopDev() flow — let stopDev set the final phase.
    if (dev.stopRequested) return;

    // Clean self-exit (code=0, no signal) = HMR rebuild → respawn; anything
    // else = real failure → backoff. Pathological clean-exit loops are
    // caught by the rolling-window cap in scheduleAutoRespawn.
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
    // Must precede kill: exit handler uses this to skip auto-respawn.
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

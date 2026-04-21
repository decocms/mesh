#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

const PORT = Number(process.env.DAEMON_PORT ?? 9000);
const TOKEN = process.env.DAEMON_TOKEN;
const WORKDIR = process.env.WORKDIR ?? "/app";
const DENO_INSTALL_DIR = "/opt/deno";
const DENO_BIN = `${DENO_INSTALL_DIR}/bin/deno`;

if (!TOKEN) {
  console.error("[sandbox-daemon] DAEMON_TOKEN not set; refusing to start");
  process.exit(1);
}

// ─── Auth ────────────────────────────────────────────────────────────────────

function authorized(req) {
  return (req.headers["authorization"] ?? "") === `Bearer ${TOKEN}`;
}

// ─── JSON helpers ────────────────────────────────────────────────────────────

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendText(
  res,
  status,
  body,
  contentType = "text/plain; charset=utf-8",
) {
  res.writeHead(status, { "content-type": contentType });
  res.end(body);
}

// ─── Bash (legacy, still used for one-shot commands) ─────────────────────────

function runBash(command, timeoutMs) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.DAEMON_TOKEN;
    const child = spawn("bash", ["-lc", command], { cwd: WORKDIR, env });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? -1, timedOut });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + String(err), exitCode: -1, timedOut });
    });
  });
}

// ─── Dev lifecycle ───────────────────────────────────────────────────────────

const LOG_RING_CAP = 2000;
const logRing = []; // { source: string, line: string, ts: number }

function appendLog(source, chunk) {
  // Split on newline; each logical line goes into the ring + subscribers.
  const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length === 0 && i === lines.length - 1) continue;
    const entry = { source, line, ts: Date.now() };
    logRing.push(entry);
    if (logRing.length > LOG_RING_CAP) logRing.shift();
    broadcast("log", { source, data: line + "\n" });
  }
}

const state = {
  phase: "idle", // idle | installing | starting | ready | exited | crashed
  pid: null,
  exitCode: null,
  port: null,
  pm: null,
  script: null,
  baselinePorts: new Set(),
  startedAt: null,
  /**
   * Port the caller wants the mesh preview iframe to land on. Used when the
   * dev process binds multiple ports (e.g. API + Vite) — whichever matches
   * wins. Null means "first non-baseline wins after a short settle window".
   */
  preferredPort: null,
};

function currentStatusPayload() {
  return {
    ready: state.phase === "ready",
    htmlSupport: state.phase === "ready",
    phase: state.phase,
    pid: state.pid,
    port: state.port,
    pm: state.pm,
    script: state.script,
    exitCode: state.exitCode,
  };
}

function setPhase(next) {
  if (state.phase === next) return;
  state.phase = next;
  broadcast("status", currentStatusPayload());
  broadcast("processes", {
    active: state.pid ? [String(state.pid)] : [],
  });
}

// ─── Package manager detection ────────────────────────────────────────────────

function hasFile(workdir, f) {
  try {
    fs.accessSync(path.join(workdir, f));
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the runtime family. Caller may override via the `/dev/start` hint —
 * this is the fallback when no hint is passed. Deno wins over Node when any
 * Deno config file is present, since deco-sites and friends ship `deno.json`
 * but may also have a stray `package.json` for editor tooling.
 */
function detectRuntime(workdir) {
  if (
    hasFile(workdir, "deno.json") ||
    hasFile(workdir, "deno.jsonc") ||
    hasFile(workdir, "deno.lock")
  ) {
    return "deno";
  }
  if (hasFile(workdir, "bun.lock") || hasFile(workdir, "bun.lockb")) {
    return "bun";
  }
  return "node";
}

function detectPackageManager(workdir) {
  if (hasFile(workdir, "bun.lock") || hasFile(workdir, "bun.lockb"))
    return "bun";
  if (hasFile(workdir, "pnpm-lock.yaml")) return "pnpm";
  if (hasFile(workdir, "yarn.lock")) return "yarn";
  if (hasFile(workdir, "package-lock.json")) return "npm";
  return "bun";
}

function readPackageJson(workdir) {
  try {
    const raw = fs.readFileSync(path.join(workdir, "package.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Minimal JSONC support: strip `//` line comments and `/* *\/` block comments,
 * and trim trailing commas. Not a full JSONC parser — good enough for the
 * `tasks` field, which is what we read.
 */
function parseJsonc(raw) {
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(stripped);
}

function readDenoConfig(workdir) {
  for (const f of ["deno.json", "deno.jsonc"]) {
    try {
      const raw = fs.readFileSync(path.join(workdir, f), "utf8");
      return f.endsWith(".jsonc") ? parseJsonc(raw) : JSON.parse(raw);
    } catch {
      // try next
    }
  }
  return null;
}

function pickScript(runtime, pkg, denoConfig) {
  if (runtime === "deno") {
    const tasks = (denoConfig && denoConfig.tasks) ?? {};
    if (typeof tasks.start === "string") return "start";
    if (typeof tasks.dev === "string") return "dev";
    return null;
  }
  const scripts = (pkg && pkg.scripts) ?? {};
  if (typeof scripts.dev === "string") return "dev";
  if (typeof scripts.start === "string") return "start";
  return null;
}

function listScripts(runtime, pkg, denoConfig) {
  if (runtime === "deno") {
    const tasks = (denoConfig && denoConfig.tasks) ?? {};
    return Object.keys(tasks);
  }
  const scripts = (pkg && pkg.scripts) ?? {};
  return Object.keys(scripts);
}

let denoInstallPromise = null;

/**
 * Lazy-install Deno into `/opt/deno` on first use. The base image ships
 * Node + Bun only; Deno is paid for by Deno projects, not every sandbox.
 * Cached by presence of the binary, so subsequent dev-starts skip the curl.
 */
function ensureDenoInstalled() {
  if (fs.existsSync(DENO_BIN)) return Promise.resolve(true);
  if (denoInstallPromise) return denoInstallPromise;
  denoInstallPromise = new Promise((resolve) => {
    appendLog("setup", `[setup] installing Deno into ${DENO_INSTALL_DIR}\n`);
    const env = { ...process.env, DENO_INSTALL: DENO_INSTALL_DIR };
    delete env.DAEMON_TOKEN;
    const child = spawn(
      "bash",
      ["-lc", "curl -fsSL https://deno.land/install.sh | sh -s -- -y"],
      { cwd: WORKDIR, env, stdio: ["ignore", "pipe", "pipe"] },
    );
    child.stdout.on("data", (d) => appendLog("setup", d));
    child.stderr.on("data", (d) => appendLog("setup", d));
    child.on("close", (code) => {
      const ok = code === 0 && fs.existsSync(DENO_BIN);
      if (!ok) {
        appendLog("setup", `[setup] Deno install failed (exit ${code})\n`);
      }
      denoInstallPromise = null;
      resolve(ok);
    });
    child.on("error", (err) => {
      appendLog("setup", `[setup] Deno install spawn error: ${String(err)}\n`);
      denoInstallPromise = null;
      resolve(false);
    });
  });
  return denoInstallPromise;
}

// ─── Port discovery ──────────────────────────────────────────────────────────

/**
 * Parse `/proc/net/tcp{,6}` and return the set of ports in LISTEN (state 0A).
 * Works without netstat/ss in the image.
 */
function snapshotListenPorts() {
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

let portPollTimer = null;

function stopPortPoll() {
  if (portPollTimer) {
    clearInterval(portPollTimer);
    portPollTimer = null;
  }
}

/**
 * How long to keep polling *after* we first see a candidate port bind. Lets
 * the dev server settle on its actual listening port before we lock in —
 * relevant for projects that run more than one process (e.g. API on :8080 and
 * Vite on :5173) where the wrong one may bind first. If `state.preferredPort`
 * matches any candidate during this window, it wins.
 */
const PORT_SETTLE_MS = 1500;

function startPortPoll() {
  stopPortPoll();
  const started = Date.now();
  let firstCandidateAt = null;
  let firstCandidate = null;
  portPollTimer = setInterval(() => {
    if (state.phase !== "starting") {
      stopPortPoll();
      return;
    }
    if (Date.now() - started > PORT_POLL_MAX_MS) {
      stopPortPoll();
      appendLog(
        "daemon",
        `[sandbox-daemon] timed out waiting for dev server to bind a port\n`,
      );
      return;
    }
    const candidates = [];
    for (const p of snapshotListenPorts()) {
      if (p === PORT) continue;
      if (state.baselinePorts.has(p)) continue;
      candidates.push(p);
    }
    if (candidates.length === 0) return;

    // User-configured port wins as soon as it appears — no need to wait.
    if (state.preferredPort && candidates.includes(state.preferredPort)) {
      state.port = state.preferredPort;
      setPhase("ready");
      stopPortPoll();
      return;
    }

    // No preference (or preferred hasn't bound yet): record the first
    // candidate and wait a short settle window for the preferred port to
    // appear. Lock in the first candidate after the window elapses.
    if (firstCandidate == null) {
      firstCandidate = candidates[0];
      firstCandidateAt = Date.now();
    }
    if (
      !state.preferredPort ||
      Date.now() - firstCandidateAt >= PORT_SETTLE_MS
    ) {
      state.port = firstCandidate;
      setPhase("ready");
      stopPortPoll();
      return;
    }
  }, PORT_POLL_INTERVAL_MS);
  portPollTimer.unref?.();
}

// ─── Dev process management ──────────────────────────────────────────────────

let devChild = null;

function killDev(signal = "SIGTERM") {
  if (!devChild || devChild.pid == null) return;
  try {
    // Use negative PID to signal the entire process group (detached=true).
    process.kill(-devChild.pid, signal);
  } catch {
    try {
      devChild.kill(signal);
    } catch {}
  }
}

async function waitForExit(graceMs) {
  if (!devChild) return;
  const child = devChild;
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

function runInstall(cmd, args) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.DAEMON_TOKEN;
    const child = spawn(cmd, args, {
      cwd: WORKDIR,
      env,
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

function hasNodeModules() {
  try {
    const entries = fs.readdirSync(path.join(WORKDIR, "node_modules"));
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function startDev({
  script: requestedScript,
  restart,
  preferredPort,
  runtime: runtimeHint,
} = {}) {
  const parsedPreferred =
    preferredPort == null
      ? null
      : Number.isFinite(Number(preferredPort))
        ? Number(preferredPort)
        : null;
  state.preferredPort = parsedPreferred;
  if (
    !restart &&
    (state.phase === "installing" ||
      state.phase === "starting" ||
      state.phase === "ready")
  ) {
    return;
  }
  if (devChild) {
    killDev("SIGTERM");
    await waitForExit(5_000);
    devChild = null;
  }

  state.pid = null;
  state.port = null;
  state.exitCode = null;
  state.startedAt = Date.now();

  // Caller's hint wins; otherwise sniff the workdir. Deno wins over Node when
  // both `package.json` and `deno.json` exist (common in deco-sites repos).
  const runtime =
    runtimeHint === "deno" || runtimeHint === "bun" || runtimeHint === "node"
      ? runtimeHint
      : detectRuntime(WORKDIR);

  const pkg = readPackageJson(WORKDIR);
  const denoConfig = runtime === "deno" ? readDenoConfig(WORKDIR) : null;
  const pm = runtime === "deno" ? "deno" : detectPackageManager(WORKDIR);
  const script = requestedScript ?? pickScript(runtime, pkg, denoConfig);
  state.pm = pm;
  state.script = script ?? null;

  if (!script) {
    const where = runtime === "deno" ? "deno.json tasks" : "package.json";
    appendLog(
      "daemon",
      `[sandbox-daemon] no "dev" or "start" script in ${where} — cannot auto-start\n`,
    );
    setPhase("crashed");
    return;
  }

  // Install step. For Node/Bun we gate on node_modules; for Deno we only
  // ensure the Deno binary is present — `deno task` handles module caching
  // on first run, and `deno install` semantics vary too much across versions
  // (pre-2.0 it's a script-installer, 2.x it's a project-installer) to be a
  // reliable warm-up call here.
  if (runtime === "deno") {
    setPhase("installing");
    const ok = await ensureDenoInstalled();
    if (!ok) {
      setPhase("crashed");
      return;
    }
  } else if (!hasNodeModules()) {
    setPhase("installing");
    appendLog("setup", `[setup] running ${pm} install in ${WORKDIR}\n`);
    const code = await runInstall(pm, ["install"]);
    if (code !== 0) {
      appendLog("setup", `[setup] ${pm} install failed (exit ${code})\n`);
      setPhase("crashed");
      return;
    }
    appendLog("setup", `[setup] ${pm} install completed\n`);
  }

  // Baseline LISTEN ports BEFORE spawn so we can diff after.
  state.baselinePorts = snapshotListenPorts();
  setPhase("starting");

  const env = { ...process.env };
  delete env.DAEMON_TOKEN;
  // Give frameworks that respect these a hint. Anything that binds to 127.0.0.1
  // is still reachable — the daemon proxies via loopback — so no --host trick
  // is required. These just make discovery snappier when the framework honors
  // them (Next.js, some Vite configs, etc.).
  env.HOST = env.HOST ?? "0.0.0.0";
  // We do NOT set PORT — the framework's default (e.g. Vite 5173, Next 3000)
  // is fine. We discover whatever port appears.

  const [cmd, cmdArgs, humanCmd] =
    runtime === "deno"
      ? [DENO_BIN, ["task", script], `deno task ${script}`]
      : [pm, ["run", script], `${pm} run ${script}`];

  const child = spawn(cmd, cmdArgs, {
    cwd: WORKDIR,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  devChild = child;
  state.pid = child.pid ?? null;

  // Tag dev process output with the script name so the UI's per-script tab
  // (which keys off the `source` field) actually picks up the logs. Daemon
  // lifecycle events stay on source="daemon".
  const scriptSource = script;
  appendLog(
    "daemon",
    `[sandbox-daemon] spawned ${humanCmd} (pid ${child.pid})\n`,
  );

  child.stdout.on("data", (d) => appendLog(scriptSource, d));
  child.stderr.on("data", (d) => appendLog(scriptSource, d));
  child.on("exit", (code, signal) => {
    state.exitCode = code ?? null;
    appendLog(
      "daemon",
      `[sandbox-daemon] dev process exited (code=${code}, signal=${signal})\n`,
    );
    stopPortPoll();
    if (devChild === child) devChild = null;
    setPhase(code === 0 ? "exited" : "crashed");
    state.pid = null;
  });
  child.on("error", (err) => {
    appendLog("daemon", `[sandbox-daemon] spawn error: ${String(err)}\n`);
    stopPortPoll();
    if (devChild === child) devChild = null;
    setPhase("crashed");
    state.pid = null;
  });

  startPortPoll();
}

async function stopDev() {
  if (!devChild) {
    if (state.phase === "ready" || state.phase === "starting") {
      setPhase("exited");
    }
    return;
  }
  killDev("SIGTERM");
  await waitForExit(5_000);
  devChild = null;
  state.pid = null;
  state.port = null;
  setPhase("exited");
}

// ─── SSE subscribers (for /_decopilot_vm/events) ─────────────────────────────

const subscribers = new Set();

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

function replayTo(res) {
  res.write(
    `event: status\ndata: ${JSON.stringify(currentStatusPayload())}\n\n`,
  );
  const replayRuntime = detectRuntime(WORKDIR);
  const pkg = readPackageJson(WORKDIR);
  const denoConfig = replayRuntime === "deno" ? readDenoConfig(WORKDIR) : null;
  res.write(
    `event: scripts\ndata: ${JSON.stringify({
      scripts: listScripts(replayRuntime, pkg, denoConfig),
    })}\n\n`,
  );
  res.write(
    `event: processes\ndata: ${JSON.stringify({
      active: state.pid ? [String(state.pid)] : [],
    })}\n\n`,
  );
  // Replay the tail of logs so newly-connected clients see recent output.
  const tail = logRing.slice(-200);
  for (const entry of tail) {
    res.write(
      `event: log\ndata: ${JSON.stringify({
        source: entry.source,
        data: entry.line + "\n",
      })}\n\n`,
    );
  }
}

// ─── HTTP proxy to container loopback (/proxy/:port/*) ───────────────────────

function parseProxyUrl(url) {
  // Match /proxy/<digits>(/rest)?(?search)?
  const m = /^\/proxy\/(\d+)(\/[^?]*)?(\?.*)?$/.exec(url);
  if (!m) return null;
  const port = Number(m[1]);
  const subPath = m[2] ?? "/";
  const search = m[3] ?? "";
  return { port, subPath, search };
}

function proxyHttp(req, res, parsed) {
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.authorization;
  // content-length / transfer-encoding travel with the body. Keep them.

  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: parsed.port,
      path: parsed.subPath + parsed.search,
      method: req.method,
      headers,
    },
    (u) => {
      res.writeHead(u.statusCode ?? 502, u.headers);
      u.pipe(res);
    },
  );

  upstream.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
    }
    res.end(
      JSON.stringify({
        error: "Upstream connection failed",
        detail: String(err),
      }),
    );
  });

  req.pipe(upstream);
}

// ─── Server ──────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // Health is intentionally unauthenticated — runner probes it before a token
  // is in play.
  if (req.method === "GET" && req.url === "/health") {
    send(res, 200, { ok: true });
    return;
  }

  if (!authorized(req)) {
    send(res, 401, { error: "unauthorized" });
    return;
  }

  const url = req.url ?? "/";

  // Dev SSE — browser-visible via the mesh proxy. Auth already checked above
  // (the mesh forwards the bearer on our behalf).
  if (req.method === "GET" && url === "/_decopilot_vm/events") {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    subscribers.add(res);
    replayTo(res);
    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat\n\n`);
      } catch {
        clearInterval(heartbeat);
        subscribers.delete(res);
      }
    }, 15_000);
    heartbeat.unref?.();
    res.on("close", () => {
      clearInterval(heartbeat);
      subscribers.delete(res);
    });
    return;
  }

  // Dev lifecycle.
  if (req.method === "POST" && url === "/dev/start") {
    const body = await readJson(req).catch(() => ({}));
    startDev(body).catch((err) => {
      appendLog(
        "daemon",
        `[sandbox-daemon] /dev/start error: ${String(err)}\n`,
      );
    });
    send(res, 202, currentStatusPayload());
    return;
  }
  if (req.method === "POST" && url === "/dev/stop") {
    await stopDev().catch(() => {});
    send(res, 200, currentStatusPayload());
    return;
  }
  if (req.method === "GET" && url === "/dev/status") {
    send(res, 200, currentStatusPayload());
    return;
  }
  if (req.method === "GET" && url.startsWith("/dev/logs")) {
    const u = new URL(url, "http://local");
    const tail = Math.max(
      1,
      Math.min(LOG_RING_CAP, Number(u.searchParams.get("tail") ?? 200)),
    );
    const source = u.searchParams.get("source");
    const entries = logRing
      .filter((e) => !source || e.source === source)
      .slice(-tail)
      .map((e) => e.line)
      .join("\n");
    sendText(res, 200, entries + (entries ? "\n" : ""));
    return;
  }
  if (req.method === "GET" && url === "/dev/scripts") {
    const scriptsRuntime = detectRuntime(WORKDIR);
    const pkg = readPackageJson(WORKDIR);
    const denoConfig =
      scriptsRuntime === "deno" ? readDenoConfig(WORKDIR) : null;
    send(res, 200, {
      scripts: listScripts(scriptsRuntime, pkg, denoConfig),
      pm: scriptsRuntime === "deno" ? "deno" : detectPackageManager(WORKDIR),
    });
    return;
  }

  // HTTP proxy to container loopback.
  if (url.startsWith("/proxy/")) {
    const parsed = parseProxyUrl(url);
    if (!parsed) {
      send(res, 400, { error: "Invalid proxy URL" });
      return;
    }
    proxyHttp(req, res, parsed);
    return;
  }

  // Legacy bash endpoint — kept for one-shot commands.
  if (req.method === "POST" && url === "/bash") {
    try {
      const { command, timeoutMs = 60_000 } = await readJson(req);
      if (typeof command !== "string" || command.length === 0) {
        send(res, 400, { error: "command is required" });
        return;
      }
      const result = await runBash(command, Number(timeoutMs));
      send(res, 200, result);
    } catch (err) {
      send(res, 500, { error: String(err) });
    }
    return;
  }

  send(res, 404, { error: "not found" });
});

// ─── WebSocket upgrade passthrough for /proxy/:port/* ────────────────────────

server.on("upgrade", (req, clientSocket, head) => {
  // Require bearer on upgrade — mesh attaches it server-to-server.
  if ((req.headers["authorization"] ?? "") !== `Bearer ${TOKEN}`) {
    clientSocket.write(
      "HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n",
    );
    clientSocket.destroy();
    return;
  }

  const parsed = parseProxyUrl(req.url ?? "");
  if (!parsed) {
    clientSocket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    clientSocket.destroy();
    return;
  }

  const upstream = net.connect(parsed.port, "127.0.0.1", () => {
    // Rebuild the upgrade request with the rewritten path and stripped
    // proxy-only headers, then pipe both directions.
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.authorization;
    headers.host = `127.0.0.1:${parsed.port}`;

    const lines = [`${req.method} ${parsed.subPath + parsed.search} HTTP/1.1`];
    for (const [k, v] of Object.entries(headers)) {
      if (Array.isArray(v)) {
        for (const vv of v) lines.push(`${k}: ${vv}`);
      } else if (v != null) {
        lines.push(`${k}: ${v}`);
      }
    }
    lines.push("\r\n");
    upstream.write(lines.join("\r\n"));
    if (head && head.length) upstream.write(head);

    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });

  upstream.on("error", () => {
    try {
      clientSocket.write(
        "HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n",
      );
    } catch {}
    clientSocket.destroy();
  });
  clientSocket.on("error", () => {
    upstream.destroy();
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[sandbox-daemon] listening on 0.0.0.0:${PORT}, workdir=${WORKDIR}`,
  );
  // No boot-time auto-start: the daemon listens before the provisioner has had
  // a chance to clone the repo (the clone flows through this daemon's /bash).
  // The caller fires /dev/start explicitly once `ensure()` returns, i.e. after
  // the clone is complete — so the workdir is guaranteed populated before
  // script detection runs.
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    await stopDev().catch(() => {});
    server.close(() => process.exit(0));
  });
}

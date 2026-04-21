#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.env.DAEMON_PORT ?? 9000);
const TOKEN = process.env.DAEMON_TOKEN;
const WORKDIR = process.env.WORKDIR ?? "/app";
const DENO_INSTALL_DIR = "/opt/deno";
const DENO_BIN = `${DENO_INSTALL_DIR}/bin/deno`;

// Claude Code CLI is lazy-installed by /claude-code/query on first use. The
// version here stays in lockstep with the pinned constant in shared.ts — bump
// both (and the translator fixtures) in the same PR.
const CLAUDE_CODE_VERSION = process.env.CLAUDE_CODE_VERSION ?? "2.1.116";
const CLAUDE_BIN = "/usr/local/bin/claude";
const CLAUDE_CREDS_PATH = "/root/.claude/.credentials.json";

// Worktree isolation: when cwd points at a per-thread git worktree, claude
// is spawned in a private mount namespace with that path bind-mounted onto
// /app. The agent's view of /app becomes its thread's files only — no
// `/app/workspaces/thread-<uuid>` leaking into tool output, and stray
// absolute-path writes (/CLAUDE.md, /tmp is shared but /app is private)
// don't pollute sibling threads. Falls back to a plain spawn if unshare
// or the bind mount errors.
const WORKTREE_PATH_RE = /^\/app\/workspaces\/thread-[A-Za-z0-9_-]+\/?$/;

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

function runBash(command, timeoutMs, cwd = WORKDIR) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.DAEMON_TOKEN;
    const child = spawn("bash", ["-lc", command], { cwd, env });
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

// ─── Log ring ────────────────────────────────────────────────────────────────
//
// Two rings: a shared `daemonLogRing` for events that aren't tied to any one
// thread (container setup, claude-code invocations, daemon lifecycle), and
// per-thread rings kept on each DevState. Log readers and SSE replays merge
// both so a thread-scoped viewer still sees setup/install chatter that
// happened before its dev process spawned.

const LOG_RING_CAP = 2000;
const DAEMON_LOG_CAP = 500;

const daemonLogRing = []; // { source, line, ts }

function appendLog(source, chunk, threadId) {
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
    // Mirror to stdout with a short thread tag so `docker logs` stays greppable
    // per thread when multiple dev processes are running.
    const tag =
      threadId && threadId !== DEFAULT_THREAD
        ? `${source}/${shortTid(threadId)}`
        : source;
    console.log(`[${tag}] ${line}`);
  }
}

function shortTid(tid) {
  return tid.replace(/^thrd_/, "").slice(0, 8);
}

// ─── Per-thread dev state ────────────────────────────────────────────────────
//
// Each thread ID maps to an independent DevState. When no `threadId` is
// supplied by the caller (legacy single-dev path) we fall back to the
// DEFAULT_THREAD key so old container images / callers keep working.

const DEFAULT_THREAD = "_default";

/** Map<threadKey, DevState> */
const devByThread = new Map();

/**
 * Set of ports currently bound by a dev child across all threads. Used by the
 * port-poll loop to exclude other threads' ports from its candidate set so
 * two near-simultaneous starts don't fight over the same LISTEN port.
 */
const ownedPorts = new Set();

function makeDevState(key) {
  return {
    threadId: key,
    cwd: WORKDIR,
    phase: "idle", // idle | installing | starting | ready | exited | crashed
    pid: null,
    exitCode: null,
    port: null,
    pm: null,
    script: null,
    baselinePorts: new Set(),
    startedAt: null,
    preferredPort: null,
    child: null,
    portPollTimer: null,
    stopInFlight: null,
    logRing: [], // { source, line, ts }
    // Crash-loop backoff: consecutive fast crashes (exit < FAST_CRASH_MS
    // after spawn) accumulate here. `/dev/start` refuses until the
    // computed backoff window elapses, so a persistent startup failure
    // (missing dep, bad config) doesn't turn into hundreds of respawns
    // driven by UI polling. Cleared on `ready` and on `restart: true`.
    crashCount: 0,
    lastCrashAt: null,
  };
}

const FAST_CRASH_MS = 10_000;
const MAX_BACKOFF_MS = 60_000;

function computeCrashBackoffMs(dev) {
  if (!dev.crashCount) return 0;
  return Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (dev.crashCount - 1));
}

function crashBackoffRemainingMs(dev) {
  if (!dev.crashCount || !dev.lastCrashAt) return 0;
  const elapsed = Date.now() - dev.lastCrashAt;
  const backoff = computeCrashBackoffMs(dev);
  return Math.max(0, backoff - elapsed);
}

function getDev(threadId) {
  const key = threadId || DEFAULT_THREAD;
  let dev = devByThread.get(key);
  if (!dev) {
    dev = makeDevState(key);
    devByThread.set(key, dev);
  }
  return dev;
}

function currentStatusPayload(threadId) {
  const dev = getDev(threadId);
  const backoffRemainingMs = crashBackoffRemainingMs(dev);
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
    crashBackoffRemainingMs: backoffRemainingMs,
    crashCount: dev.crashCount,
  };
}

function setPhase(dev, next) {
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

// ─── Claude Code lazy install ────────────────────────────────────────────────

let claudeInstallPromise = null;

/**
 * Fallback install of Claude Code CLI when the image doesn't ship it. The
 * `mesh-sandbox:claude` variant bakes this in at build time and the binary
 * check short-circuits; this path only runs when someone points
 * `/claude-code/query` at a container built from the plain base image.
 *
 * Uses bun (already on PATH from the base image) rather than npm — bun's
 * install is ~5× faster for this package and symlinks the binary into
 * /usr/local/bun/bin, matching the bake-time layout.
 */
function ensureClaudeCodeInstalled() {
  if (fs.existsSync(CLAUDE_BIN)) return Promise.resolve(true);
  if (claudeInstallPromise) return claudeInstallPromise;
  claudeInstallPromise = new Promise((resolve) => {
    appendLog(
      "setup",
      `[setup] installing @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} via bun\n`,
    );
    const env = { ...process.env };
    delete env.DAEMON_TOKEN;
    const child = spawn(
      "bun",
      ["install", "-g", `@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}`],
      { cwd: WORKDIR, env, stdio: ["ignore", "pipe", "pipe"] },
    );
    child.stdout.on("data", (d) => appendLog("setup", d));
    child.stderr.on("data", (d) => appendLog("setup", d));
    child.on("close", (code) => {
      // bun install -g drops shims in /root/.bun/bin by default (regardless
      // of BUN_INSTALL, which only controls where bun itself lives). Symlink
      // into CLAUDE_BIN so spawn() and `which claude` both work.
      if (code === 0 && !fs.existsSync(CLAUDE_BIN)) {
        try {
          fs.symlinkSync("/root/.bun/bin/claude", CLAUDE_BIN);
        } catch (err) {
          appendLog(
            "setup",
            `[setup] failed to symlink claude into ${CLAUDE_BIN}: ${String(err)}\n`,
          );
        }
      }
      const ok = code === 0 && fs.existsSync(CLAUDE_BIN);
      if (!ok) {
        appendLog(
          "setup",
          `[setup] claude-code install failed (exit ${code})\n`,
        );
      }
      claudeInstallPromise = null;
      resolve(ok);
    });
    child.on("error", (err) => {
      appendLog(
        "setup",
        `[setup] claude-code install spawn error: ${String(err)}\n`,
      );
      claudeInstallPromise = null;
      resolve(false);
    });
  });
  return claudeInstallPromise;
}

// ─── Claude Code query ───────────────────────────────────────────────────────

/**
 * Buffer bytes from an IncomingMessage until the first LF. Returns the line
 * (without the LF) plus any bytes that came after it on the same chunk — the
 * caller is expected to pipe the rest of the request body onward. On EOF
 * without an LF, resolves with the whole buffer as `line` and null `rest`.
 *
 * Uses on('data') rather than `for await`: async iteration calls
 * iterator.return() when we break out of the loop, which destroys the stream.
 * We need the stream to stay alive so the caller can pipe remaining bytes to
 * claude's stdin.
 */
function readFirstLine(req) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const idx = buffer.indexOf(0x0a);
      if (idx === -1) return;
      cleanup();
      req.pause();
      resolve({
        line: buffer.subarray(0, idx).toString("utf8"),
        rest: idx + 1 < buffer.length ? buffer.subarray(idx + 1) : null,
      });
    };
    const onEnd = () => {
      cleanup();
      resolve({ line: buffer.toString("utf8"), rest: null });
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
    };
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });
}

/**
 * Allow-list for env vars forwarded from the mesh-side SpawnOptions.env.
 * Everything else is noise for this container (HOME, PATH, and a pile of
 * ANTHROPIC_CLI_* metrics vars for the host's claude install). We keep the
 * CLAUDE_* / ANTHROPIC_* families since they carry auth and behavior flags.
 */
const CLAUDE_ENV_PREFIXES = ["CLAUDE_", "ANTHROPIC_"];

function filterClaudeEnv(env) {
  const out = {};
  if (!env || typeof env !== "object") return out;
  for (const [k, v] of Object.entries(env)) {
    if (typeof v !== "string") continue;
    if (CLAUDE_ENV_PREFIXES.some((p) => k.startsWith(p))) out[k] = v;
  }
  return out;
}

/**
 * Materialize `files` ({ "/container/path": contents }) into the container.
 * Used to shuttle `--mcp-config` / `--settings` JSON from the mesh adapter
 * into a file path claude can read. Paths must be absolute and rooted in
 * /tmp so a compromised mesh process can't clobber container state outside
 * its own ephemeral scratch area.
 */
function writeContainerFiles(files) {
  const written = [];
  for (const [p, contents] of Object.entries(files ?? {})) {
    if (typeof p !== "string" || !p.startsWith("/tmp/")) {
      throw new Error(`refusing to write outside /tmp: ${p}`);
    }
    if (typeof contents !== "string") {
      throw new Error(`file contents for ${p} must be a string`);
    }
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, contents, { mode: 0o600 });
    written.push(p);
  }
  return written;
}

/**
 * Same as writeContainerFiles but for state that must survive the child's
 * exit — notably `CLAUDE_CONFIG_DIR/.credentials.json`, which doubles as the
 * root for session history (`projects/<cwd>/<sessionId>.jsonl`). Wiping
 * these between turns broke `--resume`, so they're written without joining
 * the per-turn unlink set.
 */
function writePersistentFiles(files) {
  for (const [p, contents] of Object.entries(files ?? {})) {
    if (typeof p !== "string" || !p.startsWith("/tmp/")) {
      throw new Error(`refusing to write outside /tmp: ${p}`);
    }
    if (typeof contents !== "string") {
      throw new Error(`file contents for ${p} must be a string`);
    }
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, contents, { mode: 0o600 });
  }
}

/**
 * Build the (bin, args, cwd) triple used to spawn claude. For per-thread
 * worktrees we wrap the invocation in `unshare --user --map-root-user
 * --mount` so a private mount namespace bind-mounts the worktree onto
 * `/app`. Net effect:
 *   - the agent's `/app` IS its thread's worktree
 *   - stray absolute-path writes (e.g. the Write tool writing `/CLAUDE.md`
 *     when the user said "create CLAUDE.md") don't leak into sibling
 *     threads' worktrees
 *   - `/app/workspaces/thread-<uuid>` never surfaces in tool output; the
 *     agent works in what looks like a clean `/app` root
 *
 * Non-worktree spawns (blank sandboxes, legacy threads) pass through
 * unchanged — no container-wide change in behavior for existing flows.
 */
function buildClaudeInvocation(bin, args, cwd) {
  if (!WORKTREE_PATH_RE.test(cwd)) {
    return { cmd: bin, cmdArgs: args, spawnCwd: cwd, isolated: false };
  }
  // Shell-escape cwd for the inline `sh -c`. The regex above already
  // rejects anything outside `[A-Za-z0-9_-]` plus the fixed prefix, so
  // the escape is a belt-and-braces guard against future regex loosening.
  const safeCwd = cwd.replace(/'/g, `'\\''`);
  // `propagation=private` so the bind is local to our namespace — no chance
  // of leaking back to host or peer namespaces. `cd /app` before exec so
  // claude's own `process.cwd()` resolves to the neutral `/app` rather than
  // the worktree's real path.
  const script =
    `mount --make-rprivate / 2>/dev/null; ` +
    `mount --bind '${safeCwd}' /app && cd /app && exec "$@"`;
  return {
    cmd: "unshare",
    cmdArgs: [
      "--user",
      "--map-root-user",
      "--mount",
      "sh",
      "-c",
      script,
      "--",
      bin,
      ...args,
    ],
    // Node's spawn cwd must exist and be reachable pre-namespace. The
    // shell wrapper will `cd /app` after the bind mount, so this value
    // is effectively a placeholder — but it still has to be a real path
    // that exists outside the namespace.
    spawnCwd: "/app",
    isolated: true,
  };
}

/**
 * POST /claude-code/query — remote SpawnedProcess over HTTP.
 *
 * Backs `@anthropic-ai/claude-agent-sdk`'s `spawnClaudeCodeProcess` hook.
 * The SDK on the mesh side builds the full claude CLI invocation (args,
 * env, cwd); this endpoint runs it inside the container, streaming stdin
 * and stdout between the two processes.
 *
 * Wire protocol:
 *   Request (ndjson body):
 *     line 1: { "args": string[], "env"?: {...}, "cwd"?: string, "files"?: {...} }
 *     lines 2+: bytes piped into claude stdin
 *   Response:
 *     200, content-type: application/x-ndjson
 *     Body: claude stdout, byte-for-byte
 *     Trailer: X-Claude-Exit = <exit code>
 *
 * The `command` field in SpawnOptions is ignored — we always run CLAUDE_BIN.
 * Mesh-side callers should set `pathToClaudeCodeExecutable: "claude"` so the
 * SDK's own ChildProcess fallback stays consistent with what we do here.
 *
 * Credentials come from /root/.claude/.credentials.json, bind-mounted from
 * the host. The CLI refreshes the access token in-place during long turns,
 * so the mount is read-write.
 *
 * Personal MCP servers and skills attached to the credentialed OAuth
 * identity are NOT suppressed — self-hosted, single-user tool; the user is
 * running their own claude against their own mesh thread.
 */
async function handleClaudeCodeQuery(req, res) {
  const installed = await ensureClaudeCodeInstalled();
  if (!installed) {
    send(res, 500, {
      error: "claude-code CLI install failed — check /dev/logs?source=setup",
    });
    return;
  }
  // Creds can come from either the legacy bind-mount at CLAUDE_CREDS_PATH
  // (/root/.claude/.credentials.json) OR per-spawn via the inline `files`
  // map + `CLAUDE_CONFIG_DIR` env. We don't pre-check here anymore — if
  // both paths are missing, claude itself surfaces the auth error in its
  // first stream chunk, which mesh forwards to the user verbatim.

  let first;
  try {
    first = await readFirstLine(req);
  } catch (err) {
    send(res, 400, { error: `failed to read request body: ${String(err)}` });
    return;
  }
  let config;
  try {
    config = JSON.parse(first.line);
  } catch {
    send(res, 400, {
      error: "first body line must be JSON { args, env?, cwd?, files? }",
    });
    return;
  }
  if (!Array.isArray(config.args)) {
    send(res, 400, { error: "config.args must be a string[]" });
    return;
  }

  let writtenFiles = [];
  try {
    writtenFiles = writeContainerFiles(config.files);
    writePersistentFiles(config.persistentFiles);
  } catch (err) {
    send(res, 400, { error: String(err) });
    return;
  }

  const env = { ...process.env, ...filterClaudeEnv(config.env) };
  delete env.DAEMON_TOKEN;

  const rawCwd = typeof config.cwd === "string" ? config.cwd : WORKDIR;
  const { cmd, cmdArgs, spawnCwd, isolated } = buildClaudeInvocation(
    CLAUDE_BIN,
    config.args,
    rawCwd,
  );

  appendLog(
    "claude-code",
    `[sandbox-daemon] spawning ${cmd} ${cmdArgs.join(" ")}` +
      `${isolated ? " (isolated: /app ← " + rawCwd + ")" : ""}\n`,
  );

  const child = spawn(cmd, cmdArgs, {
    cwd: spawnCwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  res.writeHead(200, {
    "content-type": "application/x-ndjson",
    "transfer-encoding": "chunked",
    trailer: "x-claude-exit, x-claude-stderr",
  });

  // Capture stderr both in the daemon log AND inline in the response trailer
  // area so the mesh can surface claude errors to the user. We buffer the
  // last 2KB of stderr and emit it as a trailer on non-zero exit.
  let stderrTail = "";
  const STDERR_TAIL_LIMIT = 2048;
  child.stderr.on("data", (d) => {
    const s = d.toString("utf8");
    appendLog("claude-code", s);
    stderrTail = (stderrTail + s).slice(-STDERR_TAIL_LIMIT);
  });

  // Claude stdout → HTTP response body. We pipe without `end: true` so we
  // can attach the exit-code trailer on child exit.
  child.stdout.pipe(res, { end: false });
  child.stdout.on("data", (d) =>
    appendLog(
      "claude-code",
      `[stdout ${d.length}B] ${d.toString("utf8").slice(0, 200)}\n`,
    ),
  );

  // Stream the remaining request body into claude's stdin. Anything that
  // came on the same chunk as the config line goes in first; `req.pipe`
  // will call child.stdin.end() on request end, which signals EOF to
  // claude.
  if (first.rest) {
    appendLog(
      "claude-code",
      `[sandbox-daemon] prepended ${first.rest.length}B from first chunk to stdin\n`,
    );
    child.stdin.write(first.rest);
  }
  let stdinBytes = 0;
  req.on("data", (chunk) => {
    stdinBytes += chunk.length;
  });
  req.on("end", () => {
    appendLog(
      "claude-code",
      `[sandbox-daemon] stdin ended after ${stdinBytes}B\n`,
    );
  });
  req.pipe(child.stdin, { end: true });

  // Client aborts (browser/agent went away) → kill the child so we don't
  // orphan a headless claude chewing through the account's rate limit.
  //
  // `close` fires for BOTH normal end-of-request (after 'end') and abnormal
  // disconnect. We only want to kill on abnormal — if `req.complete` is true
  // at close time, the body flowed fully and claude is just finishing up.
  // Killing here would SIGTERM claude mid-response and strip the final
  // `result` event from the stream.
  req.on("close", () => {
    if (req.complete) {
      appendLog(
        "claude-code",
        `[sandbox-daemon] req closed normally, letting claude finish\n`,
      );
      return;
    }
    if (child.exitCode == null && !child.killed) {
      appendLog(
        "claude-code",
        `[sandbox-daemon] req aborted (complete=false), SIGTERM child\n`,
      );
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode == null) child.kill("SIGKILL");
      }, 2_000).unref?.();
    }
  });

  const cleanup = () => {
    for (const p of writtenFiles) fs.unlink(p, () => {});
  };

  child.on("exit", (code) => {
    appendLog(
      "claude-code",
      `[sandbox-daemon] claude exited code=${code ?? "null"} stderr_tail=${JSON.stringify(stderrTail)}\n`,
    );
    try {
      const trailers = { "x-claude-exit": String(code ?? -1) };
      if (stderrTail) {
        trailers["x-claude-stderr"] = Buffer.from(stderrTail, "utf8").toString(
          "base64",
        );
      }
      res.addTrailers(trailers);
      res.end();
    } catch {}
    cleanup();
  });
  child.on("error", (err) => {
    appendLog(
      "claude-code",
      `[sandbox-daemon] claude spawn error: ${String(err)}\n`,
    );
    try {
      res.addTrailers({ "x-claude-exit": "-1" });
      res.end();
    } catch {}
    cleanup();
  });
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

/**
 * How long to keep polling *after* we first see a candidate port bind. Lets
 * the dev server settle on its actual listening port before we lock in —
 * relevant for projects that run more than one process (e.g. API on :8080 and
 * Vite on :5173) where the wrong one may bind first. If `dev.preferredPort`
 * matches any candidate during this window, it wins.
 */
const PORT_SETTLE_MS = 1500;

function stopPortPoll(dev) {
  if (dev.portPollTimer) {
    clearInterval(dev.portPollTimer);
    dev.portPollTimer = null;
  }
}

function startPortPoll(dev) {
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
      // starts don't cross-wire (A's poll locking onto B's Vite port).
      if (ownedPorts.has(p)) continue;
      candidates.push(p);
    }
    if (candidates.length === 0) return;

    // User-configured port wins as soon as it appears — no need to wait.
    if (dev.preferredPort && candidates.includes(dev.preferredPort)) {
      dev.port = dev.preferredPort;
      ownedPorts.add(dev.port);
      setPhase(dev, "ready");
      stopPortPoll(dev);
      return;
    }

    // No preference (or preferred hasn't bound yet): record the first
    // candidate and wait a short settle window for the preferred port to
    // appear. Lock in the first candidate after the window elapses.
    if (firstCandidate == null) {
      firstCandidate = candidates[0];
      firstCandidateAt = Date.now();
    }
    if (!dev.preferredPort || Date.now() - firstCandidateAt >= PORT_SETTLE_MS) {
      dev.port = firstCandidate;
      ownedPorts.add(dev.port);
      setPhase(dev, "ready");
      stopPortPoll(dev);
      return;
    }
  }, PORT_POLL_INTERVAL_MS);
  dev.portPollTimer.unref?.();
}

// ─── Dev process management ──────────────────────────────────────────────────

function killDev(dev, signal = "SIGTERM") {
  if (!dev.child || dev.child.pid == null) return;
  try {
    // Signal the script runner directly (not the process group). Runners like
    // `deno task`, `bun run`, and `pnpm run` trap SIGTERM and forward it to
    // their child; if we also broadcast to the pgid, the user's server sees
    // the signal twice — once from the pgid kill, once from the runner's
    // forward. `waitForExit` still escalates to a pgid SIGKILL after the
    // grace window, so orphaned descendants are caught on the way out.
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
    const env = { ...process.env };
    delete env.DAEMON_TOKEN;
    const child = spawn(cmd, args, {
      cwd,
      env,
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

async function startDev({
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
  // callers that subscribe without a threadId keep getting its events.
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
  // Crash-loop guard: a non-forcing caller (e.g. UI polling loop) that asks
  // us to start while we're still in the backoff window after a fast-crash
  // streak is refused. `restart: true` bypasses so a human-triggered
  // "restart dev server" button or a code fix still works. Without this,
  // UI polls hammer `/dev/start` every few seconds when the dev script
  // has a persistent startup failure (missing dep, bad config) and the
  // container burns CPU respawning a process that can't possibly boot.
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
    // Explicit restart trusts the caller — a fresh chance means a fresh
    // counter. Covers the "user clicked restart after fixing their code"
    // path, which should not inherit prior crash history.
    dev.crashCount = 0;
    dev.lastCrashAt = null;
  }
  if (dev.child) {
    await stopDev(key);
  }

  dev.pid = null;
  if (dev.port != null) {
    ownedPorts.delete(dev.port);
  }
  dev.port = null;
  dev.exitCode = null;
  dev.startedAt = Date.now();

  // Caller's hint wins; otherwise sniff the workdir. Deno wins over Node when
  // both `package.json` and `deno.json` exist (common in deco-sites repos).
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
  // (pre-2.0 it's a script-installer, 2.x it's a project-installer) to be a
  // reliable warm-up call here.
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
    cwd: workdir,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  dev.child = child;
  dev.pid = child.pid ?? null;

  // Tag dev process output with the script name so the UI's per-script tab
  // (which keys off the `source` field) actually picks up the logs. Daemon
  // lifecycle events stay on source="daemon".
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
    // Fast-crash bookkeeping: only non-zero exits that happen within
    // FAST_CRASH_MS of startup count toward the backoff streak. A dev
    // server that ran fine for an hour and then got SIGKILLed shouldn't
    // be punished.
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

async function stopDev(threadId) {
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

// ─── SSE subscribers (for /_decopilot_vm/events) ─────────────────────────────

/** Map<res, { threadId: string | null }> */
const subscribers = new Map();

/**
 * Fan out an event. `threadId === null` means daemon-wide (claude-code,
 * boot chatter) — every subscriber gets it. A string `threadId` is scoped:
 * only subscribers that registered the same threadId (or the default-thread
 * subscribers when the event is for DEFAULT_THREAD) receive it.
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
      // Subscribers filter strictly: no threadId registered → only default-
      // thread events (tid === null when the scoped thread is DEFAULT, but
      // we pass null explicitly for default via broadcastTid). Scoped subs
      // see only their own thread's events.
      if (subbedTid !== tid) continue;
    }
    try {
      res.write(line);
    } catch {
      subscribers.delete(res);
    }
  }
}

function readMergedLogs(threadId, source) {
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

function replayTo(res, threadId) {
  const tid = threadId ?? null;
  res.write(
    `event: status\ndata: ${JSON.stringify(currentStatusPayload(threadId))}\n\n`,
  );
  const replayCwd = threadId ? getDev(threadId).cwd : WORKDIR;
  const replayRuntime = detectRuntime(replayCwd);
  const pkg = readPackageJson(replayCwd);
  const denoConfig =
    replayRuntime === "deno" ? readDenoConfig(replayCwd) : null;
  res.write(
    `event: scripts\ndata: ${JSON.stringify({
      scripts: listScripts(replayRuntime, pkg, denoConfig),
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
  // Replay the tail of logs so newly-connected clients see recent output.
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
  if (req.method === "GET" && url.startsWith("/_decopilot_vm/events")) {
    const u = new URL(url, "http://local");
    const threadId = u.searchParams.get("threadId") || null;
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    subscribers.set(res, { threadId });
    replayTo(res, threadId);
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

  // Dev lifecycle. All endpoints accept an optional `threadId` (query for
  // GETs, body for POSTs). Omitted → DEFAULT_THREAD for backward compat.
  if (req.method === "POST" && url === "/dev/start") {
    const body = await readJson(req).catch(() => ({}));
    startDev(body).catch((err) => {
      appendLog(
        "daemon",
        `[sandbox-daemon] /dev/start error: ${String(err)}\n`,
        body?.threadId || null,
      );
    });
    send(res, 202, currentStatusPayload(body?.threadId));
    return;
  }
  if (req.method === "POST" && url === "/dev/stop") {
    const body = await readJson(req).catch(() => ({}));
    await stopDev(body?.threadId).catch(() => {});
    send(res, 200, currentStatusPayload(body?.threadId));
    return;
  }
  if (req.method === "GET" && url.startsWith("/dev/status")) {
    const u = new URL(url, "http://local");
    if (u.searchParams.get("all") === "1") {
      const threads = {};
      for (const k of devByThread.keys()) {
        threads[k] = currentStatusPayload(k);
      }
      send(res, 200, { threads });
      return;
    }
    const threadId = u.searchParams.get("threadId") || null;
    send(res, 200, currentStatusPayload(threadId));
    return;
  }
  if (req.method === "GET" && url.startsWith("/dev/logs")) {
    const u = new URL(url, "http://local");
    const tail = Math.max(
      1,
      Math.min(LOG_RING_CAP, Number(u.searchParams.get("tail") ?? 200)),
    );
    const source = u.searchParams.get("source");
    const threadId = u.searchParams.get("threadId") || null;
    const entries = readMergedLogs(threadId, source)
      .slice(-tail)
      .map((e) => e.line)
      .join("\n");
    sendText(res, 200, entries + (entries ? "\n" : ""));
    return;
  }
  if (req.method === "GET" && url.startsWith("/dev/scripts")) {
    const u = new URL(url, "http://local");
    const threadId = u.searchParams.get("threadId") || null;
    const cwdParam = u.searchParams.get("cwd");
    const scriptsCwd =
      cwdParam && cwdParam.length > 0
        ? cwdParam
        : threadId
          ? getDev(threadId).cwd
          : WORKDIR;
    const scriptsRuntime = detectRuntime(scriptsCwd);
    const pkg = readPackageJson(scriptsCwd);
    const denoConfig =
      scriptsRuntime === "deno" ? readDenoConfig(scriptsCwd) : null;
    send(res, 200, {
      scripts: listScripts(scriptsRuntime, pkg, denoConfig),
      pm: scriptsRuntime === "deno" ? "deno" : detectPackageManager(scriptsCwd),
      cwd: scriptsCwd,
    });
    return;
  }

  // Claude Code streaming query — see handleClaudeCodeQuery for the wire
  // protocol. Kept above the generic /proxy catch-all so the path isn't
  // mistaken for a dev-server proxy.
  if (req.method === "POST" && url === "/claude-code/query") {
    await handleClaudeCodeQuery(req, res).catch((err) => {
      appendLog(
        "claude-code",
        `[sandbox-daemon] /claude-code/query error: ${String(err)}\n`,
      );
      if (!res.headersSent) {
        send(res, 500, { error: String(err) });
      } else {
        try {
          res.end();
        } catch {}
      }
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
      const { command, timeoutMs = 60_000, cwd } = await readJson(req);
      if (typeof command !== "string" || command.length === 0) {
        send(res, 400, { error: "command is required" });
        return;
      }
      const result = await runBash(command, Number(timeoutMs), cwd);
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
    await Promise.all(
      Array.from(devByThread.keys()).map((k) => stopDev(k).catch(() => {})),
    );
    server.close(() => process.exit(0));
  });
}

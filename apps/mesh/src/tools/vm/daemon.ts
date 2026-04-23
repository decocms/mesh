/**
 * In-VM Daemon Script Builder
 *
 * Generates the Node.js daemon that runs inside Freestyle VMs.
 * The daemon handles:
 *   1. Reverse proxy: strips X-Frame-Options/CSP for iframe embedding
 *   2. Process spawning: install/dev lifecycle with PTY + SSE streaming
 *   3. Liveness probing: probes upstream dev server
 *   4. File operations: read/write/edit/grep/glob/bash endpoints
 */

import { PACKAGE_MANAGER_DAEMON_CONFIG } from "../../shared/runtime-defaults";

export interface DaemonConfig {
  upstreamPort: string;
  packageManager: string | null;
  pathPrefix: string;
  port: string;
  cloneUrl: string;
  repoName: string;
  proxyPort: number;
  bootstrapScript: string;
  gitUserName: string;
  gitUserEmail: string;
  /**
   * Branch to check out after clone. Required, non-empty. The daemon clones
   * with `-b <branch>` so origin/<branch> points at the intended commit.
   */
  branch: string;
}

export function buildDaemonScript(config: DaemonConfig): string {
  const {
    upstreamPort,
    packageManager,
    pathPrefix,
    port,
    cloneUrl,
    repoName,
    proxyPort,
    bootstrapScript,
    gitUserName,
    gitUserEmail,
    branch,
  } = config;

  if (!/^\d+$/.test(upstreamPort)) {
    throw new Error(`Invalid upstream port: ${upstreamPort}`);
  }
  if (typeof branch !== "string" || branch.length === 0) {
    throw new Error("DaemonConfig.branch is required and must be non-empty");
  }

  return `const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");
const UPSTREAM = "${upstreamPort}";
const UPSTREAM_HOST = "localhost";
const PROXY_PORT = ${proxyPort};
const BOOTSTRAP = ${JSON.stringify(bootstrapScript)};
const MAX_SSE_CLIENTS = 10;
const CLONE_URL = ${JSON.stringify(cloneUrl)};
const REPO_NAME = ${JSON.stringify(repoName)};
const PM = ${JSON.stringify(packageManager)};
const PORT = ${JSON.stringify(port)};
const PATH_PREFIX = ${JSON.stringify(pathPrefix)};
const GIT_USER_NAME = ${JSON.stringify(gitUserName)};
const GIT_USER_EMAIL = ${JSON.stringify(gitUserEmail)};
const BRANCH = ${JSON.stringify(branch)};

const APP_ROOT = "/app";
const DECO_UID = 1000;
const DECO_GID = 1000;
const DECO_ENV = Object.assign({}, process.env, { TERM: "xterm-256color", HOME: "/home/deco", LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" });

const PM_CONFIG = ${JSON.stringify(PACKAGE_MANAGER_DAEMON_CONFIG)};

const WELL_KNOWN_STARTERS = ["dev", "start"];

// --- Process-level error handlers (keep daemon alive on unhandled errors) ---
process.on("uncaughtException", (err) => {
  console.error("[daemon] uncaughtException:", err.stack || err.message || err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[daemon] unhandledRejection:", reason);
});

// --- Path safety ---
function safePath(userPath) {
  const resolved = path.resolve(APP_ROOT, userPath);
  if (!resolved.startsWith(APP_ROOT + "/") && resolved !== APP_ROOT) {
    return null;
  }
  return resolved;
}

// --- JSON body parser (base64-encoded payloads) ---
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      log("parseJsonBody", "url=" + req.url, "rawLength=" + raw.length);
      try {
        // Decode base64 → percent-encoded UTF-8 → original JSON string
        const decoded = decodeURIComponent(
          atob(raw).split("").map(function(c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          }).join("")
        );
        const parsed = JSON.parse(decoded);
        log("parseJsonBody", "parsed OK, keys=" + Object.keys(parsed).join(","));
        resolve(parsed);
      } catch (e) {
        log("parseJsonBody", "FAILED to parse", "error=" + e.message, "raw=" + raw.slice(0, 1000));
        reject(new Error("Failed to parse body: " + e.message + " | raw=" + raw.slice(0, 200)));
      }
    });
    req.on("error", reject);
  });
}

function jsonResponse(res, statusCode, body) {
  if (res.writableEnded || res.destroyed) {
    log("jsonResponse: response already closed, dropping", statusCode, JSON.stringify(body).slice(0, 200));
    return;
  }
  res.writeHead(statusCode, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(body));
}

// --- Logging ---
function log(...args) {
  const ts = new Date().toISOString();
  const msg = "[daemon] " + ts + " " + args.join(" ");
  console.log(msg);
  broadcastChunk("daemon", msg + "\\r\\n");
}

// --- SSE state ---
const sseClients = new Set();
let lastStatus = { ready: false, htmlSupport: false };

// --- Process state ---
const children = {};
const replayBuffers = { setup: "", daemon: "" };
const REPLAY_BYTES = 4096;
let setupDone = false;
let discoveredScripts = null;
let lastBranchStatus = null;
let branchStatusTimer = null;
let branchStatusWatcher = null;

function broadcastChunk(source, data) {
  if (!data) return;
  if (!replayBuffers[source]) replayBuffers[source] = "";
  const buf = replayBuffers[source] + data;
  replayBuffers[source] = buf.length > REPLAY_BYTES ? buf.slice(buf.length - REPLAY_BYTES) : buf;
  const payload = JSON.stringify({ source: source, data: data });
  for (const res of sseClients) {
    if (res.writable) res.write("event: log\\ndata: " + payload + "\\n\\n");
  }
}

function broadcastEvent(eventName, data) {
  const payload = JSON.stringify(data);
  for (const res of sseClients) {
    if (res.writable) res.write("event: " + eventName + "\\ndata: " + payload + "\\n\\n");
  }
}

function computeBranchStatus() {
  const exec = (cmd) => {
    try {
      return execSync(cmd, {
        cwd: APP_ROOT,
        uid: DECO_UID,
        gid: DECO_GID,
        env: DECO_ENV,
        stdio: ["ignore", "pipe", "ignore"],
      }).toString().trim();
    } catch (e) {
      return "";
    }
  };
  const refExists = (ref) => exec("git rev-parse --verify --quiet " + JSON.stringify(ref)).length > 0;
  try {
    const branch = exec("git rev-parse --abbrev-ref HEAD");
    if (!branch || branch === "HEAD") return null;
    let base = exec("git symbolic-ref --short refs/remotes/origin/HEAD");
    if (base.startsWith("origin/")) base = base.slice("origin/".length);
    if (!base) base = "main";
    const dirty = exec("git status --porcelain=v1").length > 0;

    // origin/<branch> may not exist (not fetched yet, or local-only). Fall back
    // to HEAD on the "branch" side when it's missing — we can still measure
    // ahead-of-base that way; unpushed stays 0 because we can't see a diff.
    const branchRef = refExists("origin/" + branch) ? "origin/" + branch : "HEAD";
    const unpushed = branchRef === "origin/" + branch
      ? Number(exec("git rev-list --count origin/" + branch + "..HEAD") || "0")
      : 0;

    let aheadOfBase = 0, behindBase = 0;
    if (refExists("origin/" + base)) {
      const lrcount = exec("git rev-list --left-right --count origin/" + base + "..." + branchRef);
      const m = lrcount.match(/^(\\d+)\\s+(\\d+)$/);
      if (m) { behindBase = Number(m[1]); aheadOfBase = Number(m[2]); }
    }
    // Current head sha — used by the frontend to detect branch advances
    // past a merged PR's head.
    const headSha = exec("git rev-parse " + branchRef);
    return { branch: branch, base: base, workingTreeDirty: dirty, unpushed: unpushed, aheadOfBase: aheadOfBase, behindBase: behindBase, headSha: headSha };
  } catch (e) {
    log("branch-status compute failed:", e && e.message ? e.message : e);
    return null;
  }
}

function emitBranchStatus() {
  const next = computeBranchStatus();
  if (!next) return;
  if (lastBranchStatus && JSON.stringify(lastBranchStatus) === JSON.stringify(next)) return;
  lastBranchStatus = next;
  broadcastEvent("branch-status", Object.assign({ type: "branch-status" }, next));
}

function scheduleBranchStatusRefresh() {
  if (branchStatusTimer) return;
  branchStatusTimer = setTimeout(() => {
    branchStatusTimer = null;
    emitBranchStatus();
  }, 250);
}

function watchGitDir() {
  if (branchStatusWatcher) return;
  const gitDir = APP_ROOT + "/.git";
  try {
    branchStatusWatcher = fs.watch(gitDir, { recursive: true }, () => {
      scheduleBranchStatusRefresh();
    });
    log("branch-status: watching " + gitDir);
  } catch (e) {
    log("branch-status: fs.watch failed, falling back to polling:", e && e.message ? e.message : e);
    setInterval(emitBranchStatus, 5000);
  }
}

function runProcess(source, cmd, label) {
  if (children[source]) {
    log("killing", source, "pid=" + children[source].pid);
    try { children[source].kill("SIGKILL"); } catch (e) {}
    children[source] = null;
  }
  if (!replayBuffers[source]) replayBuffers[source] = "";
  broadcastChunk(source, label + "\\r\\n");
  const child = spawn("script", ["-q", "-c", cmd, "/dev/null"], {
    stdio: ["ignore", "pipe", "pipe"],
    uid: DECO_UID,
    gid: DECO_GID,
    env: DECO_ENV,
  });
  children[source] = child;
  log("spawned", source, "pid=" + child.pid);
  broadcastEvent("processes", { type: "processes", active: Object.keys(children).filter(k => children[k] !== null) });
  child.stdout.on("data", (chunk) => {
    broadcastChunk(source, chunk.toString("utf-8"));
  });
  child.stderr.on("data", (chunk) => {
    broadcastChunk(source, chunk.toString("utf-8"));
  });
  child.on("close", (code) => {
    log(source, "exited", "pid=" + child.pid, "code=" + code);
    if (children[source] === child) children[source] = null;
    broadcastEvent("processes", { type: "processes", active: Object.keys(children).filter(k => children[k] !== null) });
  });
  return child;
}

function discoverScripts() {
  if (!PM) return;
  let scripts = {};
  try {
    if (PM === "deno") {
      for (const f of ["deno.json", "deno.jsonc"]) {
        try {
          const raw = fs.readFileSync("/app/" + f, "utf-8");
          const parsed = JSON.parse(raw);
          scripts = parsed.tasks || {};
          break;
        } catch (e) { /* file not found or parse error, try next */ }
      }
    } else {
      try {
        const raw = fs.readFileSync("/app/package.json", "utf-8");
        const parsed = JSON.parse(raw);
        scripts = parsed.scripts || {};
      } catch (e) { /* no package.json */ }
    }
  } catch (e) {
    log("script discovery failed:", e.message);
  }
  const scriptNames = Object.keys(scripts);
  discoveredScripts = scriptNames;
  log("discovered scripts:", scriptNames.join(", ") || "(none)");
  broadcastEvent("scripts", { type: "scripts", scripts: scriptNames });
}

function runSetup() {
  // Clone the repo's default branch, then switch to BRANCH — fetching it
  // from origin when the remote has it, or creating it locally off default
  // when it does not. This keeps newly-generated deco/* branches
  // working without requiring the caller to push first.
  // BRANCH is always non-empty — validated at daemon build time.
  const branchNameOk = (b) => /^[A-Za-z0-9._/-]+$/.test(b) && !b.startsWith("-");
  if (!branchNameOk(BRANCH)) {
    broadcastChunk("setup", "\\r\\nInvalid branch name: " + BRANCH + "\\r\\n");
    log("invalid branch name: " + BRANCH);
    return;
  }
  const cloneCmd = "git clone --depth 1 " + CLONE_URL + " /app";
  const cloneLabel = "$ git clone --depth 1 " + REPO_NAME + " /app";
  broadcastChunk("setup", cloneLabel + "\\r\\n");

  const child = spawn("script", ["-q", "-c", cloneCmd, "/dev/null"], {
    stdio: ["ignore", "pipe", "pipe"],
    uid: DECO_UID,
    gid: DECO_GID,
    env: DECO_ENV,
  });
  log("spawned setup (clone) pid=" + child.pid);
  child.stdout.on("data", (chunk) => broadcastChunk("setup", chunk.toString("utf-8")));
  child.stderr.on("data", (chunk) => broadcastChunk("setup", chunk.toString("utf-8")));
  child.on("close", (code) => {
    log("clone exited code=" + code);
    if (code !== 0) {
      broadcastChunk("setup", "\\r\\nClone failed with exit code " + code + "\\r\\n");
      return;
    }

    // Configure git identity.
    try {
      execSync("git config user.name " + JSON.stringify(GIT_USER_NAME), { cwd: "/app", uid: DECO_UID, gid: DECO_GID, env: DECO_ENV });
      execSync("git config user.email " + JSON.stringify(GIT_USER_EMAIL), { cwd: "/app", uid: DECO_UID, gid: DECO_GID, env: DECO_ENV });
    } catch (e) {
      log("git identity setup failed:", e.message);
      broadcastChunk("setup", "\\r\\nWarning: could not set up git identity\\r\\n");
    }

    // Resolve BRANCH: fetch from remote when it exists there, otherwise
    // create locally off the default branch we just cloned.
    //
    // The refspec form +refs/heads/BRANCH:refs/remotes/origin/BRANCH creates
    // the remote-tracking ref in one step so branch-status can diff against
    // origin/<branch>. The paired local-branch copy happens with a second
    // fetch using the BRANCH:BRANCH refspec below.
    let branchOnRemote = false;
    try {
      execSync(
        "git fetch origin " +
          JSON.stringify("+refs/heads/" + BRANCH + ":refs/remotes/origin/" + BRANCH),
        { cwd: "/app", uid: DECO_UID, gid: DECO_GID, env: DECO_ENV, stdio: "pipe" },
      );
      execSync(
        "git fetch origin " + JSON.stringify(BRANCH) + ":" + JSON.stringify(BRANCH),
        { cwd: "/app", uid: DECO_UID, gid: DECO_GID, env: DECO_ENV, stdio: "pipe" },
      );
      branchOnRemote = true;
    } catch (e) {
      // Branch doesn't exist on remote — create it locally below.
      log("fetch origin " + BRANCH + " failed (branch likely absent remote): " + (e && e.message ? e.message : e));
    }

    try {
      if (branchOnRemote) {
        execSync("git checkout " + JSON.stringify(BRANCH), { cwd: "/app", uid: DECO_UID, gid: DECO_GID, env: DECO_ENV });
        broadcastChunk("setup", "\\r\\n$ git checkout " + BRANCH + " (from origin)\\r\\n");
        log("checked out " + BRANCH + " from remote");
      } else {
        execSync("git checkout -b " + JSON.stringify(BRANCH), { cwd: "/app", uid: DECO_UID, gid: DECO_GID, env: DECO_ENV });
        broadcastChunk("setup", "\\r\\n$ git checkout -b " + BRANCH + " (new local)\\r\\n");
        log("created local branch " + BRANCH + " off default");
      }
    } catch (e) {
      log("git branch setup failed:", e.message);
      broadcastChunk("setup", "\\r\\nWarning: could not set up branch " + BRANCH + "\\r\\n");
    }

    if (!PM) {
      setupDone = true;
      emitBranchStatus();
      watchGitDir();
      log("setup complete (clone only, no package manager)");
      return;
    }
    // Run install in the same "setup" stream
    const pmConfig = PM_CONFIG[PM];
    if (!pmConfig) { setupDone = true; emitBranchStatus(); watchGitDir(); return; }
    const corepackSetup = "export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 && corepack enable && ";
    const installCmd = PATH_PREFIX + "cd /app && " + corepackSetup + pmConfig.install;
    const installLabel = "$ " + pmConfig.install;
    broadcastChunk("setup", "\\r\\n" + installLabel + "\\r\\n");

    const installChild = spawn("script", ["-q", "-c", installCmd, "/dev/null"], {
      stdio: ["ignore", "pipe", "pipe"],
      uid: DECO_UID,
      gid: DECO_GID,
      env: DECO_ENV,
    });
    log("spawned setup (install) pid=" + installChild.pid);
    installChild.stdout.on("data", (chunk) => broadcastChunk("setup", chunk.toString("utf-8")));
    installChild.stderr.on("data", (chunk) => broadcastChunk("setup", chunk.toString("utf-8")));
    installChild.on("close", (installCode) => {
      log("install exited code=" + installCode);
      setupDone = true;
      emitBranchStatus();
      watchGitDir();
      if (installCode === 0) {
        log("setup complete, discovering scripts");
        discoverScripts();
      } else {
        broadcastChunk("setup", "\\r\\nInstall failed with exit code " + installCode + "\\r\\n");
      }
    });
  });
}

// --- Liveness probe ---
let probeCount = 0;
const FAST_PROBE_MS = 3000;
const SLOW_PROBE_MS = 30000;
const FAST_PROBE_LIMIT = 20;

function probeUpstream() {
  const prevReady = lastStatus.ready;
  const req = http.request(
    { hostname: UPSTREAM_HOST, port: UPSTREAM, path: "/", method: "HEAD", timeout: 5000 },
    (res) => {
      const ct = (res.headers["content-type"] || "").toLowerCase();
      lastStatus = {
        ready: res.statusCode >= 200 && res.statusCode < 400,
        htmlSupport: ct.includes("text/html"),
      };
      if (lastStatus.ready !== prevReady) {
        log("upstream", lastStatus.ready ? "UP" : "DOWN", "status=" + res.statusCode);
      }
    }
  );
  req.on("error", () => {
    if (prevReady) log("upstream DOWN (error)");
    lastStatus = { ready: false, htmlSupport: false };
  });
  req.on("timeout", () => { req.destroy(); });
  req.end();

  probeCount++;
  const nextDelay = probeCount < FAST_PROBE_LIMIT ? FAST_PROBE_MS : SLOW_PROBE_MS;
  setTimeout(probeUpstream, nextDelay);
}

setTimeout(probeUpstream, 1000);

// --- File operation handlers ---

async function handleRead(req, res) {
  try {
    const body = await parseJsonBody(req);
    const filePath = safePath(body.path || "");
    if (!filePath) return jsonResponse(res, 400, { error: "Path escapes /app" });

    let stat;
    try { stat = fs.statSync(filePath); } catch { return jsonResponse(res, 400, { error: "File not found: " + body.path }); }
    if (stat.isDirectory()) return jsonResponse(res, 400, { error: "Path is a directory" });

    // Binary detection: check first 8KB for null bytes
    const fd = fs.openSync(filePath, "r");
    const probe = Buffer.alloc(Math.min(8192, stat.size));
    fs.readSync(fd, probe, 0, probe.length, 0);
    fs.closeSync(fd);
    if (probe.includes(0)) return jsonResponse(res, 400, { error: "File appears to be binary" });

    const raw = fs.readFileSync(filePath, "utf-8");
    const lines = raw.split("\\n");
    const offset = Math.max(1, body.offset || 1);
    const limit = body.limit || 2000;
    const slice = lines.slice(offset - 1, offset - 1 + limit);
    const numbered = slice.map((line, i) => (offset + i) + "\\t" + line).join("\\n");
    jsonResponse(res, 200, { content: numbered, lineCount: lines.length });
  } catch (e) {
    jsonResponse(res, 500, { error: e.message });
  }
}

async function handleWrite(req, res) {
  try {
    const body = await parseJsonBody(req);
    if (typeof body.content !== "string") return jsonResponse(res, 400, { error: "content is required" });
    const filePath = safePath(body.path || "");
    if (!filePath) return jsonResponse(res, 400, { error: "Path escapes /app" });

    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, body.content, "utf-8");
    jsonResponse(res, 200, { ok: true, bytesWritten: Buffer.byteLength(body.content, "utf-8") });
  } catch (e) {
    jsonResponse(res, 500, { error: e.message });
  }
}

async function handleEdit(req, res) {
  try {
    const body = await parseJsonBody(req);
    const filePath = safePath(body.path || "");
    if (!filePath) return jsonResponse(res, 400, { error: "Path escapes /app" });
    if (!body.old_string || typeof body.old_string !== "string") return jsonResponse(res, 400, { error: "old_string is required" });
    if (typeof body.new_string !== "string") return jsonResponse(res, 400, { error: "new_string is required" });
    if (body.old_string === body.new_string) return jsonResponse(res, 400, { error: "old_string and new_string must differ" });

    let content;
    try { content = fs.readFileSync(filePath, "utf-8"); } catch { return jsonResponse(res, 400, { error: "File not found: " + body.path }); }

    const replaceAll = body.replace_all === true;
    const count = content.split(body.old_string).length - 1;
    if (count === 0) return jsonResponse(res, 400, { error: "old_string not found in file" });
    if (!replaceAll && count > 1) return jsonResponse(res, 400, { error: "old_string found " + count + " times. Use replace_all or provide more context to make it unique." });

    const updated = replaceAll ? content.replaceAll(body.old_string, body.new_string) : content.replace(body.old_string, body.new_string);
    fs.writeFileSync(filePath, updated, "utf-8");
    jsonResponse(res, 200, { ok: true, replacements: replaceAll ? count : 1 });
  } catch (e) {
    jsonResponse(res, 500, { error: e.message });
  }
}

async function handleGrep(req, res) {
  try {
    const body = await parseJsonBody(req);
    if (!body.pattern) return jsonResponse(res, 400, { error: "pattern is required" });

    const searchPath = body.path ? safePath(body.path) : APP_ROOT;
    if (!searchPath) return jsonResponse(res, 400, { error: "Path escapes /app" });

    const args = [];
    const mode = body.output_mode || "files";
    if (mode === "files") args.push("--files-with-matches");
    else if (mode === "count") args.push("--count");
    else args.push("--line-number");

    if (body.ignore_case) args.push("-i");
    if (body.context && mode === "content") args.push("-C", String(body.context));
    if (body.glob) args.push("--glob", body.glob);
    args.push("--", body.pattern, searchPath);

    const limit = body.limit || 250;
    const child = spawn("rg", args, { cwd: APP_ROOT, stdio: ["ignore", "pipe", "pipe"], uid: DECO_UID, gid: DECO_GID });
    let stdout = "";
    let lineCount = 0;
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf-8");
      const lines = text.split("\\n");
      for (const line of lines) {
        if (lineCount >= limit) break;
        if (line) { stdout += (stdout ? "\\n" : "") + line; lineCount++; }
      }
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf-8"); });
    child.on("close", (code) => {
      // rg exits 1 when no matches found — not an error
      if (code > 1) return jsonResponse(res, 500, { error: stderr || "rg failed with code " + code });
      jsonResponse(res, 200, { results: stdout, matchCount: lineCount });
    });
  } catch (e) {
    jsonResponse(res, 500, { error: e.message });
  }
}

async function handleGlob(req, res) {
  try {
    const body = await parseJsonBody(req);
    if (!body.pattern) return jsonResponse(res, 400, { error: "pattern is required" });

    const searchPath = body.path ? safePath(body.path) : APP_ROOT;
    if (!searchPath) return jsonResponse(res, 400, { error: "Path escapes /app" });

    const child = spawn("rg", ["--files", "--glob", body.pattern, searchPath], { cwd: APP_ROOT, stdio: ["ignore", "pipe", "pipe"], uid: DECO_UID, gid: DECO_GID });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf-8"); });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf-8"); });
    child.on("close", (code) => {
      if (code > 1) return jsonResponse(res, 500, { error: stderr || "rg failed with code " + code });
      const files = stdout.split("\\n").filter(Boolean).slice(0, 1000).map(f => {
        return f.startsWith(APP_ROOT + "/") ? f.slice(APP_ROOT.length + 1) : f;
      });
      jsonResponse(res, 200, { files: files });
    });
  } catch (e) {
    jsonResponse(res, 500, { error: e.message });
  }
}

async function handleBash(req, res) {
  try {
    const body = await parseJsonBody(req);
    if (!body.command || typeof body.command !== "string") return jsonResponse(res, 400, { error: "command is required" });

    const timeout = Math.min(body.timeout || 30000, 120000);
    const child = spawn("bash", ["-c", body.command], {
      cwd: APP_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      uid: DECO_UID,
      gid: DECO_GID,
      env: DECO_ENV,
    });

    let stdout = "";
    let stderr = "";
    let killed = false;
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf-8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf-8"); });

    const timer = setTimeout(() => {
      killed = true;
      try { child.kill("SIGKILL"); } catch (e) {}
    }, timeout);

    child.on("close", (code) => {
      clearTimeout(timer);
      jsonResponse(res, 200, { stdout: stdout, stderr: stderr, exitCode: killed ? -1 : (code ?? 1) });
    });
  } catch (e) {
    jsonResponse(res, 500, { error: e.message });
  }
}

// --- HTTP server ---
http.createServer(async (req, res) => {
  if (!req.url.startsWith("/_decopilot_vm/")) {
    log("proxy", req.method, req.url);
  }

  // SSE endpoint
  if (req.url === "/_decopilot_vm/events" && req.method === "GET") {
    if (sseClients.size >= MAX_SSE_CLIENTS) {
      log("SSE rejected (max clients)");
      res.writeHead(429, { "Access-Control-Allow-Origin": "*" });
      res.end("Too many connections");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    // 1. Replay status
    res.write("event: status\\ndata: " + JSON.stringify({ type: "status", ...lastStatus }) + "\\n\\n");
    // 2. Replay log buffers
    for (const source of Object.keys(replayBuffers)) {
      const buf = replayBuffers[source];
      if (buf && buf.length > 0) {
        const payload = JSON.stringify({ source: source, data: buf });
        res.write("event: log\\ndata: " + payload + "\\n\\n");
      }
    }
    // 3. Replay discovered scripts
    if (discoveredScripts) {
      res.write("event: scripts\\ndata: " + JSON.stringify({ type: "scripts", scripts: discoveredScripts }) + "\\n\\n");
    }
    // 4. Replay active processes
    const active = Object.keys(children).filter(k => children[k] !== null);
    res.write("event: processes\\ndata: " + JSON.stringify({ type: "processes", active: active }) + "\\n\\n");

    // 5. Replay last branch-status
    if (lastBranchStatus) {
      res.write("event: branch-status\\ndata: " + JSON.stringify(Object.assign({ type: "branch-status" }, lastBranchStatus)) + "\\n\\n");
    }

    sseClients.add(res);
    log("SSE connect, clients=" + sseClients.size);
    req.on("close", () => { sseClients.delete(res); log("SSE disconnect, clients=" + sseClients.size); });
    const ka = setInterval(() => {
      if (!res.writable) { clearInterval(ka); sseClients.delete(res); return; }
      res.write("event: status\\ndata: " + JSON.stringify({ type: "status", ...lastStatus }) + "\\n\\n");
    }, 15000);
    req.on("close", () => { clearInterval(ka); });
    return;
  }

  // File operation endpoints
  if (req.method === "POST" && req.url === "/_decopilot_vm/read") return handleRead(req, res);
  if (req.method === "POST" && req.url === "/_decopilot_vm/write") return handleWrite(req, res);
  if (req.method === "POST" && req.url === "/_decopilot_vm/edit") return handleEdit(req, res);
  if (req.method === "POST" && req.url === "/_decopilot_vm/grep") return handleGrep(req, res);
  if (req.method === "POST" && req.url === "/_decopilot_vm/glob") return handleGlob(req, res);
  if (req.method === "POST" && req.url === "/_decopilot_vm/bash") return handleBash(req, res);

  // Exec endpoint — run any script by name
  if (req.method === "POST" && req.url.startsWith("/_decopilot_vm/exec/")) {
    const name = req.url.slice("/_decopilot_vm/exec/".length);
    if (!name) {
      res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: "missing script name" }));
      return;
    }
    if (name === "setup") {
      log("exec setup");
      runSetup();
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (!PM || !setupDone) {
      log("exec rejected: setup not done or no package manager");
      res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: "setup not complete" }));
      return;
    }
    const pmConfig = PM_CONFIG[PM];
    if (!pmConfig) {
      res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: "unknown package manager" }));
      return;
    }
    const cmd = PATH_PREFIX + "cd /app && HOST=0.0.0.0 HOSTNAME=0.0.0.0 PORT=" + PORT + " " + pmConfig.runPrefix + " " + name;
    const label = "$ " + pmConfig.runPrefix + " " + name;
    log("exec", name);
    runProcess(name, cmd, label);
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Kill endpoint
  if (req.method === "POST" && req.url.startsWith("/_decopilot_vm/kill/")) {
    const name = req.url.slice("/_decopilot_vm/kill/".length);
    if (children[name]) {
      log("kill", name, "pid=" + children[name].pid);
      try { children[name].kill("SIGKILL"); } catch (e) {}
      children[name] = null;
      broadcastEvent("processes", { type: "processes", active: Object.keys(children).filter(k => children[k] !== null) });
    } else {
      log("kill", name, "(no process running)");
    }
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Scripts endpoint (fallback for missed SSE)
  if (req.method === "GET" && req.url === "/_decopilot_vm/scripts") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ scripts: discoveredScripts || [] }));
    return;
  }

  // CORS preflight
  if (req.method === "OPTIONS" && req.url.startsWith("/_decopilot_vm/")) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  // Catch-all for unmatched /_decopilot_vm/ routes — return 404 with CORS
  if (req.url.startsWith("/_decopilot_vm/")) {
    log("unmatched daemon route", req.method, req.url);
    jsonResponse(res, 404, { error: "Not found: " + req.url });
    return;
  }

  // Reverse proxy to upstream
  const hdrs = Object.assign({}, req.headers);
  delete hdrs["accept-encoding"];
  const opts = { hostname: UPSTREAM_HOST, port: UPSTREAM, path: req.url, method: req.method, headers: hdrs };
  const p = http.request(opts, (upstream) => {
    delete upstream.headers["x-frame-options"];
    delete upstream.headers["content-security-policy"];
    delete upstream.headers["content-encoding"];
    const ct = (upstream.headers["content-type"] || "").toLowerCase();
    if (ct.includes("text/html")) {
      delete upstream.headers["content-length"];
      res.writeHead(upstream.statusCode, upstream.headers);
      const chunks = [];
      upstream.on("data", (c) => chunks.push(c));
      upstream.on("end", () => {
        let html = Buffer.concat(chunks).toString("utf-8");
        const idx = html.lastIndexOf("</body>");
        if (idx !== -1) {
          html = html.slice(0, idx) + BOOTSTRAP + html.slice(idx);
        } else {
          html += BOOTSTRAP;
        }
        res.end(html);
      });
    } else {
      res.writeHead(upstream.statusCode, upstream.headers);
      upstream.pipe(res);
    }
  });
  p.on("error", (e) => {
    log("proxy error", req.method, req.url, e.message);
    const connErr = ["ECONNREFUSED", "ECONNRESET", "ECONNABORTED"].includes(e.code);
    if (req.url === "/" && connErr) {
      res.writeHead(503, { "Content-Type": "text/html; charset=utf-8", "Retry-After": "1", "Access-Control-Allow-Origin": "*" });
      res.end('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Starting...</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fafafa;color:#555}div{text-align:center}p{margin-top:8px;font-size:14px;color:#999}</style></head><body><div><h3>Server is starting\\u2026</h3><p>This page will refresh automatically.</p></div><script>setTimeout(function(){window.location.reload()},1000)</script></body></html>');
      return;
    }
    jsonResponse(res, 502, { error: "proxy error: " + e.message });
  });
  req.pipe(p);
}).listen(PROXY_PORT, "0.0.0.0");

// Auto-start setup on daemon boot
log("starting setup: cloning " + REPO_NAME);
runSetup();
`;
}

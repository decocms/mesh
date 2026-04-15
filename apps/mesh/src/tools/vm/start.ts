/**
 * VM_START Tool
 *
 * Creates a Freestyle VM with the connected GitHub repo
 * and infrastructure-only systemd services (ttyd, terminal, iframe-proxy).
 * App-only tool — not visible to AI models.
 *
 * Install/dev lifecycle is handled by the in-VM daemon so VM_START returns fast.
 *
 * Freestyle docs: /v2/vms, /v2/vms/configuration/systemd-services,
 * /v2/vms/configuration/ports-networking, /v2/vms/configuration/domains
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { VmSpec, freestyle } from "freestyle-sandboxes";
import { VmDeno } from "@freestyle-sh/with-deno";
import { VmBun } from "@freestyle-sh/with-bun";
import { VmNodeJs } from "@freestyle-sh/with-nodejs";
import { type VmEntry, patchActiveVms } from "./types";
import { requireVmEntry, resolveRuntimeConfig } from "./helpers";
import { DownstreamTokenStorage } from "../../storage/downstream-token";

const PROXY_PORT = 9000;

const BOOTSTRAP_SCRIPT = `<script>(function(){window.addEventListener("message",function(e){if(e.data&&e.data.type==="visual-editor::activate"&&e.data.script){try{new Function(e.data.script)()}catch(err){console.error("[visual-editor] injection failed",err)}}});})();</script>`;

// Daemon service that runs inside Freestyle VMs.
// Responsibilities:
//   1. Reverse proxy: strips X-Frame-Options/CSP so the dev server can be embedded in an iframe.
//      Injects visual-editor bootstrap script into HTML responses.
//   2. Process spawning: spawns install/dev child processes with PTY (via `script`)
//      and broadcasts stdout over SSE with a `source` field ("install" | "dev").
//      On SSE connect, replays last 5 lines per source from an in-memory buffer.
//   3. Liveness probing: probes upstream dev server (every 3s during startup, 30s steady state).
//   4. SSE endpoint: GET /_daemon/events multiplexes log and status events to connected clients.
//   5. Exec endpoints: POST /_daemon/exec/install and /_daemon/exec/dev trigger process spawning.
const buildDaemonScript = (opts: {
  upstreamPort: string;
  packageManager: string | null;
  pathPrefix: string;
  port: string;
  cloneUrl: string;
  repoName: string;
}) => {
  const { upstreamPort, packageManager, pathPrefix, port, cloneUrl, repoName } =
    opts;
  if (!/^\d+$/.test(upstreamPort)) {
    throw new Error(`Invalid upstream port: ${upstreamPort}`);
  }
  return `const http = require("http");
const fs = require("fs");
const { spawn } = require("child_process");
const UPSTREAM = "${upstreamPort}";
const UPSTREAM_HOST = "localhost";
const PROXY_PORT = ${PROXY_PORT};
const BOOTSTRAP = ${JSON.stringify(BOOTSTRAP_SCRIPT)};
const MAX_SSE_CLIENTS = 10;
const CLONE_URL = ${JSON.stringify(cloneUrl)};
const REPO_NAME = ${JSON.stringify(repoName)};
const PM = ${JSON.stringify(packageManager)};
const PORT = ${JSON.stringify(port)};
const PATH_PREFIX = ${JSON.stringify(pathPrefix)};

// Package manager config — mirrors PACKAGE_MANAGER_CONFIG from the server
const PM_CONFIG = {
  npm:  { install: "npm install",  runPrefix: "npm run" },
  pnpm: { install: "pnpm install", runPrefix: "pnpm run" },
  yarn: { install: "yarn install", runPrefix: "yarn run" },
  bun:  { install: "bun install",  runPrefix: "bun run" },
  deno: { install: "deno install", runPrefix: "deno task" },
};

const WELL_KNOWN_STARTERS = ["dev", "start"];

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
    env: Object.assign({}, process.env, { TERM: "xterm-256color" }),
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

  // Auto-start first well-known starter found
  const pmConfig = PM_CONFIG[PM];
  if (!pmConfig) return;
  for (const name of WELL_KNOWN_STARTERS) {
    if (scripts[name]) {
      const cmd = PATH_PREFIX + "cd /app && HOST=0.0.0.0 HOSTNAME=0.0.0.0 PORT=" + PORT + " " + pmConfig.runPrefix + " " + name;
      const label = "$ " + pmConfig.runPrefix + " " + name;
      log("auto-starting:", name);
      runProcess(name, cmd, label);
      break;
    }
  }
}

function runSetup() {
  const cloneCmd = "git clone " + CLONE_URL + " /app";
  const cloneLabel = "$ git clone " + REPO_NAME + " /app";
  broadcastChunk("setup", cloneLabel + "\\r\\n");

  const child = spawn("script", ["-q", "-c", cloneCmd, "/dev/null"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: Object.assign({}, process.env, { TERM: "xterm-256color" }),
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
    if (!PM) {
      setupDone = true;
      log("setup complete (clone only, no package manager)");
      return;
    }
    // Run install in the same "setup" stream
    const pmConfig = PM_CONFIG[PM];
    if (!pmConfig) { setupDone = true; return; }
    const installCmd = PATH_PREFIX + "cd /app && " + pmConfig.install;
    const installLabel = "$ " + pmConfig.install;
    broadcastChunk("setup", "\\r\\n" + installLabel + "\\r\\n");

    const installChild = spawn("script", ["-q", "-c", installCmd, "/dev/null"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: Object.assign({}, process.env, { TERM: "xterm-256color" }),
    });
    log("spawned setup (install) pid=" + installChild.pid);
    installChild.stdout.on("data", (chunk) => broadcastChunk("setup", chunk.toString("utf-8")));
    installChild.stderr.on("data", (chunk) => broadcastChunk("setup", chunk.toString("utf-8")));
    installChild.on("close", (installCode) => {
      log("install exited code=" + installCode);
      setupDone = true;
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

// --- HTTP server ---
http.createServer((req, res) => {
  if (!req.url.startsWith("/_daemon/")) {
    log("proxy", req.method, req.url);
  }

  // SSE endpoint
  if (req.url === "/_daemon/events" && req.method === "GET") {
    if (sseClients.size >= MAX_SSE_CLIENTS) {
      log("SSE rejected (max clients)");
      res.writeHead(429);
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

  // Exec endpoint — run any script by name
  if (req.method === "POST" && req.url.startsWith("/_daemon/exec/")) {
    const name = req.url.slice("/_daemon/exec/".length);
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
  if (req.method === "POST" && req.url.startsWith("/_daemon/kill/")) {
    const name = req.url.slice("/_daemon/kill/".length);
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
  if (req.method === "GET" && req.url === "/_daemon/scripts") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ scripts: discoveredScripts || [] }));
    return;
  }

  // CORS preflight
  if (req.method === "OPTIONS" && req.url.startsWith("/_daemon/")) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
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
  p.on("error", (e) => { log("proxy error", req.method, req.url, e.message); res.writeHead(502); res.end("proxy error: " + e.message); });
  req.pipe(p);
}).listen(PROXY_PORT, "0.0.0.0");

// Auto-start setup on daemon boot
log("starting setup: cloning " + REPO_NAME);
runSetup();
`;
};

/**
 * Fetches the GitHub OAuth token from downstream_tokens for the given connection.
 * Returns the authenticated git clone URL.
 */
async function buildCloneUrl(
  connectionId: string,
  owner: string,
  name: string,
  db: import("kysely").Kysely<import("../../storage/types").Database>,
  vault: import("../../encryption/credential-vault").CredentialVault,
): Promise<string> {
  const tokenStorage = new DownstreamTokenStorage(db, vault);
  const token = await tokenStorage.get(connectionId);
  if (!token) {
    throw new Error(
      "No GitHub token found. Ensure the mcp-github connection is authenticated.",
    );
  }
  return `https://x-access-token:${token.accessToken}@github.com/${owner}/${name}.git`;
}

export const VM_START = defineTool({
  name: "VM_START",
  description:
    "Start a Freestyle VM with the connected GitHub repo and dev server.",
  annotations: {
    title: "Start VM Preview",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  _meta: { ui: { visibility: "app" } },
  inputSchema: z.object({
    virtualMcpId: z.string().describe("Virtual MCP ID"),
  }),
  outputSchema: z.object({
    terminalUrl: z.string().nullable(),
    previewUrl: z.string(),
    vmId: z.string(),
    isNewVm: z.boolean(),
  }),

  handler: async (input, ctx) => {
    console.log(`[VM_START] starting for virtualMcpId=${input.virtualMcpId}`);
    const { metadata, userId } = await requireVmEntry(input, ctx);
    console.log(
      `[VM_START] userId=${userId} metadata keys: ${Object.keys(metadata).join(", ")}`,
    );

    if (!metadata.githubRepo) {
      throw new Error("No GitHub repo connected");
    }

    const { owner, name } = metadata.githubRepo;
    console.log(
      `[VM_START] githubRepo: ${owner}/${name} connectionId=${metadata.githubRepo.connectionId}`,
    );
    const { packageManager, runtime, port, runtimeBinPath } =
      resolveRuntimeConfig(metadata);
    console.log(
      `[VM_START] runtime config: pm=${packageManager} runtime=${runtime} port=${port} binPath=${runtimeBinPath}`,
    );
    const pathPrefix = runtimeBinPath
      ? `export PATH=${runtimeBinPath}:$PATH && `
      : "";

    // Build authenticated clone URL from downstream token
    console.log(
      `[VM_START] fetching downstream token for connectionId=${metadata.githubRepo.connectionId}`,
    );
    const cloneUrl = await buildCloneUrl(
      metadata.githubRepo.connectionId,
      owner,
      name,
      ctx.db,
      ctx.vault,
    );
    console.log(`[VM_START] clone URL built successfully`);

    // Generate a unique subdomain per (virtualMcpId, userId) pair.
    // MD5 of the composite key guarantees a valid, fixed-length hex subdomain
    // and avoids collisions between different users on the same Virtual MCP.
    // Freestyle docs: /v2/vms/configuration/domains
    const domainKey = createHash("md5")
      .update(`${input.virtualMcpId}:${userId}`)
      .digest("hex")
      .slice(0, 16);
    const previewDomain = `${domainKey}.deco.studio`;

    // Build the full VmSpec declaratively — integrations, repo, files, and services.
    // VmNodeJs is always included: the iframe-proxy systemd service runs Node.js on every VM.
    // Freestyle docs: /v2/vms/integrations/deno, /v2/vms/integrations/bun, /v2/vms/integrations/web-terminal
    const baseSpec = new VmSpec()
      .with("node", new VmNodeJs())
      .additionalFiles({
        "/opt/daemon.js": {
          content: buildDaemonScript({
            upstreamPort: port,
            packageManager,
            pathPrefix,
            port,
            cloneUrl,
            repoName: `${owner}/${name}`,
          }),
        },
        "/opt/run-daemon.sh": {
          content:
            "#!/bin/bash\nsource /etc/profile.d/nvm.sh\nexec node /opt/daemon.js\n",
        },
      })
      .systemdService({
        name: "daemon",
        mode: "service",
        exec: ["/bin/bash /opt/run-daemon.sh"],
        after: ["install-nodejs.service"],
        requires: ["install-nodejs.service"],
        wantedBy: ["multi-user.target"],
      });

    const spec =
      runtime === "deno"
        ? baseSpec.with("deno", new VmDeno())
        : runtime === "bun"
          ? baseSpec.with("js", new VmBun())
          : baseSpec;

    // Resume existing VM if one is tracked.
    // Try vm.start() which resumes suspended/stopped VMs. If the VM was
    // deleted externally, the call will throw — clear the stale entry and
    // fall through to create a new one.
    const existing = metadata.activeVms?.[userId];
    console.log(
      `[VM_START] existing VM entry for user: ${existing ? existing.vmId : "none"}`,
    );
    if (existing) {
      try {
        console.log(`[VM_START] attempting to resume VM: ${existing.vmId}`);
        const vm = freestyle.vms.ref({ vmId: existing.vmId, spec });
        await vm.start();
        console.log(`[VM_START] resumed existing VM: ${existing.vmId}`);
        return { ...existing, isNewVm: false };
      } catch (err) {
        // VM no longer exists on Freestyle — clear stale entry
        console.log(
          `[VM_START] VM gone, clearing stale entry: ${existing.vmId} error: ${err instanceof Error ? err.message : String(err)}`,
        );
        await patchActiveVms(
          ctx.storage.virtualMcps,
          input.virtualMcpId,
          userId,
          (vms) => {
            const updated = { ...vms };
            delete updated[userId];
            return updated;
          },
        );
        console.log(`[VM_START] stale entry cleared, will create new VM`);
      }
    }

    console.log(
      `[VM_START] repo: ${owner}/${name} pm: ${packageManager ?? "none"} runtime: ${runtime ?? "none"}`,
    );

    // Create VM from spec.
    // Domain routes to the iframe proxy which strips X-Frame-Options/CSP
    // so the preview can be embedded in an iframe.
    // Terminal domain is routed post-creation via vm.terminal.logs.route() — a persistent mapping.
    // Freestyle docs: /v2/vms/configuration/domains
    console.log(
      `[VM_START] creating new VM with domain=${previewDomain} proxyPort=${PROXY_PORT}`,
    );
    const createResult = await freestyle.vms.create({
      spec,
      domains: [{ domain: previewDomain, vmPort: PROXY_PORT }],
      // recreate: true so vm.start() rebuilds from spec if evicted.
      // Freestyle docs: /v2/vms/lifecycle/persistence
      recreate: true,
      // 30-minute idle timeout before the VM is automatically stopped.
      idleTimeoutSeconds: 1800,
    });

    console.log(
      `[VM_START] VM created: ${createResult.vmId} domain: ${previewDomain}`,
    );

    const { vmId } = createResult;

    const previewUrl = `https://${previewDomain}`;
    const terminalUrl: string | null = null;

    const entry: VmEntry = { terminalUrl, previewUrl, vmId };

    // Persist the active VM entry in the Virtual MCP metadata so all pods
    // can discover it and avoid spinning up duplicate VMs.
    console.log(
      `[VM_START] persisting VM entry: vmId=${vmId} previewUrl=${previewUrl}`,
    );
    await patchActiveVms(
      ctx.storage.virtualMcps,
      input.virtualMcpId,
      userId,
      (vms) => ({ ...vms, [userId]: entry }),
    );

    console.log(`[VM_START] done, returning new VM`);
    return { ...entry, isNewVm: true };
  },
});

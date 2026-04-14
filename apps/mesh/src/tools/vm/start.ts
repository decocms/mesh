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
  installScript: string;
  devScript: string;
  pathPrefix: string;
  port: string;
  cloneUrl: string;
  repoName: string;
}) => {
  const {
    upstreamPort,
    installScript,
    devScript,
    pathPrefix,
    port,
    cloneUrl,
    repoName,
  } = opts;
  if (!/^\d+$/.test(upstreamPort)) {
    throw new Error(`Invalid upstream port: ${upstreamPort}`);
  }
  return `const http = require("http");
const { spawn } = require("child_process");
const UPSTREAM = "${upstreamPort}";
const UPSTREAM_HOST = "localhost";
const PROXY_PORT = ${PROXY_PORT};
const BOOTSTRAP = ${JSON.stringify(BOOTSTRAP_SCRIPT)};
const MAX_SSE_CLIENTS = 10;
const CLONE_URL = ${JSON.stringify(cloneUrl)};
const REPO_NAME = ${JSON.stringify(repoName)};
const SETUP_CMD = "git clone " + CLONE_URL + " /app";
const SETUP_LABEL = "$ git clone " + REPO_NAME + " /app";
const INSTALL_CMD = ${JSON.stringify(`${pathPrefix}cd /app && ${installScript}`)};
const DEV_CMD = ${JSON.stringify(`${pathPrefix}cd /app && HOST=0.0.0.0 HOSTNAME=0.0.0.0 PORT=${port} ${devScript}`)};
const INSTALL_LABEL = ${JSON.stringify(`$ ${installScript}`)};
const DEV_LABEL = ${JSON.stringify(`$ ${devScript}`)};

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
const children = { install: null, dev: null };
const replayBuffers = { setup: "", install: "", dev: "", daemon: "" };
const REPLAY_BYTES = 4096;
let setupDone = false;

function broadcastChunk(source, data) {
  if (!data) return;
  const buf = replayBuffers[source] + data;
  replayBuffers[source] = buf.length > REPLAY_BYTES ? buf.slice(buf.length - REPLAY_BYTES) : buf;
  const payload = JSON.stringify({ source: source, data: data });
  for (const res of sseClients) {
    if (res.writable) res.write("event: log\\ndata: " + payload + "\\n\\n");
  }
}

function runProcess(source, cmd, label) {
  if (children[source]) {
    log("killing", source, "pid=" + children[source].pid);
    try { children[source].kill("SIGKILL"); } catch (e) {}
    children[source] = null;
  }
  broadcastChunk(source, label + "\\r\\n");
  const child = spawn("script", ["-q", "-c", cmd, "/dev/null"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: Object.assign({}, process.env, { TERM: "xterm-256color" }),
  });
  children[source] = child;
  log("spawned", source, "pid=" + child.pid);
  child.stdout.on("data", (chunk) => {
    broadcastChunk(source, chunk.toString("utf-8"));
  });
  child.stderr.on("data", (chunk) => {
    broadcastChunk(source, chunk.toString("utf-8"));
  });
  child.on("close", (code) => {
    log(source, "exited", "pid=" + child.pid, "code=" + code);
    if (children[source] === child) children[source] = null;
    if (source === "setup" && code === 0) {
      setupDone = true;
      log("setup complete, starting install");
      runProcess("install", INSTALL_CMD, INSTALL_LABEL);
    }
  });
}

// --- Liveness probe ---
// Probes every 3s during first 60s (startup), then every 30s (steady state)
let probeCount = 0;
const FAST_PROBE_MS = 3000;
const SLOW_PROBE_MS = 30000;
const FAST_PROBE_LIMIT = 20; // 20 * 3s = 60s

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

function broadcastStatus() {
  const payload = JSON.stringify({ type: "status", ...lastStatus });
  for (const res of sseClients) {
    if (res.writable) res.write("event: status\\ndata: " + payload + "\\n\\n");
  }
}

// Start probing after 1s
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
    // Send current status immediately
    res.write("event: status\\ndata: " + JSON.stringify({ type: "status", ...lastStatus }) + "\\n\\n");
    // Replay last lines from memory
    for (const source of ["setup", "install", "dev", "daemon"]) {
      const buf = replayBuffers[source];
      if (buf.length > 0) {
        const payload = JSON.stringify({ source: source, data: buf });
        res.write("event: log\\ndata: " + payload + "\\n\\n");
      }
    }
    sseClients.add(res);
    log("SSE connect, clients=" + sseClients.size);
    req.on("close", () => { sseClients.delete(res); log("SSE disconnect, clients=" + sseClients.size); });
    // Broadcast status every 15s (doubles as keepalive)
    const ka = setInterval(() => {
      if (!res.writable) { clearInterval(ka); sseClients.delete(res); return; }
      res.write("event: status\\ndata: " + JSON.stringify({ type: "status", ...lastStatus }) + "\\n\\n");
    }, 15000);
    req.on("close", () => { clearInterval(ka); });
    return;
  }

  // Exec endpoints
  if (req.method === "POST" && req.url === "/_daemon/exec/setup") {
    log("exec setup");
    runProcess("setup", SETUP_CMD, SETUP_LABEL);
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && req.url === "/_daemon/exec/install") {
    log("exec install");
    if (setupDone) {
      runProcess("install", INSTALL_CMD, INSTALL_LABEL);
    } else {
      log("setup not done yet, install will auto-start after clone");
    }
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && req.url === "/_daemon/exec/dev") {
    log("exec dev");
    runProcess("dev", DEV_CMD, DEV_LABEL);
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Kill endpoints
  if (req.method === "POST" && req.url.startsWith("/_daemon/kill/")) {
    const source = req.url.split("/").pop();
    if (source === "install" || source === "dev") {
      if (children[source]) {
        log("kill", source, "pid=" + children[source].pid);
        try { children[source].kill("SIGKILL"); } catch (e) {}
        children[source] = null;
      } else {
        log("kill", source, "(no process running)");
      }
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(400, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: "invalid source" }));
    }
    return;
  }

  // CORS preflight for SSE and exec endpoints
  if (req.method === "OPTIONS" && (req.url === "/_daemon/events" || req.url.startsWith("/_daemon/exec/") || req.url.startsWith("/_daemon/kill/"))) {
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

// Auto-start setup (clone) on daemon boot
log("starting setup: cloning " + REPO_NAME);
runProcess("setup", SETUP_CMD, SETUP_LABEL);
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
    const { metadata, userId } = await requireVmEntry(input, ctx);

    if (!metadata.githubRepo) {
      throw new Error("No GitHub repo connected");
    }

    const { owner, name } = metadata.githubRepo;
    const { detected, port, installScript, devScript, runtimeBinPath } =
      resolveRuntimeConfig(metadata);
    const pathPrefix = runtimeBinPath
      ? `export PATH=${runtimeBinPath}:$PATH && `
      : "";

    // Build authenticated clone URL from downstream token
    const cloneUrl = await buildCloneUrl(
      metadata.githubRepo.connectionId,
      owner,
      name,
      ctx.db,
      ctx.vault,
    );

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
            installScript,
            devScript,
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
      detected === "deno"
        ? baseSpec.with("deno", new VmDeno())
        : detected === "bun"
          ? baseSpec.with("js", new VmBun())
          : baseSpec;

    // Resume existing VM if one is tracked.
    // Try vm.start() which resumes suspended/stopped VMs. If the VM was
    // deleted externally, the call will throw — clear the stale entry and
    // fall through to create a new one.
    const existing = metadata.activeVms?.[userId];
    if (existing) {
      try {
        const vm = freestyle.vms.ref({ vmId: existing.vmId, spec });
        await vm.start();
        console.log(`[VM_START] Resumed existing VM: ${existing.vmId}`);
        return { ...existing, isNewVm: false };
      } catch {
        // VM no longer exists on Freestyle — clear stale entry
        console.log(
          `[VM_START] VM gone, clearing stale entry: ${existing.vmId}`,
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
      }
    }

    console.log(`[VM_START] repo: ${owner}/${name} runtime: ${detected}`);

    // Create VM from spec.
    // Domain routes to the iframe proxy which strips X-Frame-Options/CSP
    // so the preview can be embedded in an iframe.
    // Terminal domain is routed post-creation via vm.terminal.logs.route() — a persistent mapping.
    // Freestyle docs: /v2/vms/configuration/domains
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
    await patchActiveVms(
      ctx.storage.virtualMcps,
      input.virtualMcpId,
      userId,
      (vms) => ({ ...vms, [userId]: entry }),
    );

    return { ...entry, isNewVm: true };
  },
});

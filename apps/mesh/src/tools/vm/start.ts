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
import { type VmEntry, type VmMetadata, patchActiveVms } from "./types";
import { requireVmEntry, resolveRuntimeConfig } from "./helpers";
import type { VirtualMCPStoragePort } from "../../storage/ports";

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
}) => {
  const { upstreamPort, installScript, devScript, pathPrefix, port } = opts;
  if (!/^\d+$/.test(upstreamPort)) {
    throw new Error(`Invalid upstream port: ${upstreamPort}`);
  }
  return `const http = require("http");
const { spawn } = require("child_process");
const UPSTREAM = "${upstreamPort}";
const PROXY_PORT = ${PROXY_PORT};
const BOOTSTRAP = ${JSON.stringify(BOOTSTRAP_SCRIPT)};
const MAX_SSE_CLIENTS = 10;
const INSTALL_CMD = ${JSON.stringify(`${pathPrefix}cd /app && ${installScript}`)};
const DEV_CMD = ${JSON.stringify(`${pathPrefix}cd /app && HOST=0.0.0.0 HOSTNAME=0.0.0.0 PORT=${port} ${devScript}`)};
const INSTALL_LABEL = ${JSON.stringify(`$ ${installScript}`)};
const DEV_LABEL = ${JSON.stringify(`$ ${devScript}`)};

// --- SSE state ---
const sseClients = new Set();
let lastStatus = { ready: false, htmlSupport: false };

// --- Process state ---
const children = { install: null, dev: null };
const replayBuffers = { install: [], dev: [] };
const REPLAY_SIZE = 5;

function broadcastLog(source, lines) {
  const filtered = lines.filter(Boolean);
  if (filtered.length === 0) return;
  const buf = replayBuffers[source];
  buf.push(...filtered);
  if (buf.length > REPLAY_SIZE) {
    replayBuffers[source] = buf.slice(buf.length - REPLAY_SIZE);
  }
  const payload = JSON.stringify({ type: "log", source: source, lines: filtered });
  for (const res of sseClients) {
    if (res.writable) res.write("event: log\\ndata: " + payload + "\\n\\n");
  }
}

function runProcess(source, cmd, label) {
  if (children[source]) {
    try { children[source].kill("SIGKILL"); } catch (e) {}
    children[source] = null;
  }
  broadcastLog(source, [label]);
  const child = spawn("bash", ["-c", cmd], {
    stdio: ["ignore", "pipe", "pipe"],
    env: Object.assign({}, process.env, { TERM: "xterm-256color", FORCE_COLOR: "1" }),
  });
  children[source] = child;
  let partial = "";
  child.stdout.on("data", (chunk) => {
    partial += chunk.toString("utf-8");
    const parts = partial.split("\\n");
    partial = parts.pop() || "";
    if (parts.length > 0) broadcastLog(source, parts);
  });
  child.stderr.on("data", (chunk) => {
    const lines = chunk.toString("utf-8").split("\\n");
    broadcastLog(source, lines);
  });
  child.on("close", (code) => {
    if (partial) { broadcastLog(source, [partial]); partial = ""; }
    if (children[source] === child) children[source] = null;
  });
}

// --- Liveness probe ---
// Probes every 3s during first 60s (startup), then every 30s (steady state)
let probeCount = 0;
const FAST_PROBE_MS = 3000;
const SLOW_PROBE_MS = 30000;
const FAST_PROBE_LIMIT = 20; // 20 * 3s = 60s

function probeUpstream() {
  const req = http.request(
    { hostname: "127.0.0.1", port: UPSTREAM, path: "/", method: "HEAD", timeout: 5000 },
    (res) => {
      const ct = (res.headers["content-type"] || "").toLowerCase();
      lastStatus = {
        ready: res.statusCode >= 200 && res.statusCode < 400,
        htmlSupport: ct.includes("text/html"),
      };
    }
  );
  req.on("error", () => {
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
  // SSE endpoint
  if (req.url === "/_daemon/events" && req.method === "GET") {
    if (sseClients.size >= MAX_SSE_CLIENTS) {
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
    for (const source of ["install", "dev"]) {
      const buf = replayBuffers[source];
      if (buf.length > 0) {
        const payload = JSON.stringify({ type: "log", source: source, lines: buf });
        res.write("event: log\\ndata: " + payload + "\\n\\n");
      }
    }
    sseClients.add(res);
    req.on("close", () => { sseClients.delete(res); });
    // Broadcast status every 15s (doubles as keepalive)
    const ka = setInterval(() => {
      if (!res.writable) { clearInterval(ka); sseClients.delete(res); return; }
      res.write("event: status\\ndata: " + JSON.stringify({ type: "status", ...lastStatus }) + "\\n\\n");
    }, 15000);
    req.on("close", () => { clearInterval(ka); });
    return;
  }

  // Exec endpoints
  if (req.method === "POST" && req.url === "/_daemon/exec/install") {
    const waitCmd = "systemctl is-active --wait freestyle-git-sync.service > /dev/null 2>&1 || [ $? -eq 3 ]";
    runProcess("install", waitCmd + " && " + INSTALL_CMD, INSTALL_LABEL);
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && req.url === "/_daemon/exec/dev") {
    runProcess("dev", DEV_CMD, DEV_LABEL);
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // CORS preflight for SSE and exec endpoints
  if (req.method === "OPTIONS" && (req.url === "/_daemon/events" || req.url.startsWith("/_daemon/exec/"))) {
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
  const opts = { hostname: "127.0.0.1", port: UPSTREAM, path: req.url, method: req.method, headers: hdrs };
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
  p.on("error", (e) => { res.writeHead(502); res.end("proxy error: " + e.message); });
  req.pipe(p);
}).listen(PROXY_PORT, "0.0.0.0");
`;
};

/**
 * Ensures a Freestyle Git repo exists for the given GitHub repo.
 * Creates the repo and enables GitHub Sync on first call, then
 * persists the repoId in metadata for reuse.
 * Freestyle docs: /v2/git/repos, /v2/git/github-sync
 */
async function ensureFreestyleRepo(
  metadata: VmMetadata,
  owner: string,
  name: string,
  virtualMcpId: string,
  userId: string,
  storage: VirtualMCPStoragePort,
): Promise<string> {
  if (metadata.freestyleRepoId) {
    return metadata.freestyleRepoId;
  }

  const { repo, repoId } = await freestyle.git.repos.create({});
  await repo.githubSync.enable({ githubRepoName: `${owner}/${name}` });
  console.log(
    `[VM_START] Created Freestyle repo ${repoId} with GitHub Sync for ${owner}/${name}`,
  );

  // Persist the repoId so subsequent calls reuse it.
  const virtualMcp = await storage.findById(virtualMcpId);
  if (virtualMcp) {
    const meta = virtualMcp.metadata as VmMetadata;
    await storage.update(virtualMcpId, userId, {
      metadata: { ...meta, freestyleRepoId: repoId } as Record<string, unknown>,
    });
  }

  return repoId;
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

    // Ensure a Freestyle Git repo exists with GitHub Sync enabled.
    // This allows cloning private repos via the GitHub App integration.
    // Freestyle docs: /v2/git/repos, /v2/git/github-sync
    const repoId = await ensureFreestyleRepo(
      metadata,
      owner,
      name,
      input.virtualMcpId,
      userId,
      ctx.storage.virtualMcps,
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
      .repo(repoId, "/app")
      .additionalFiles({
        "/opt/daemon.js": {
          content: buildDaemonScript({
            upstreamPort: port,
            installScript,
            devScript,
            pathPrefix,
            port,
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

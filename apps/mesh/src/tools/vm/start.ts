/**
 * VM_START Tool
 *
 * Creates a Freestyle VM with the connected GitHub repo
 * and infrastructure-only systemd services (ttyd, terminal, iframe-proxy).
 * App-only tool — not visible to AI models.
 *
 * Install/dev lifecycle is handled by VM_EXEC so VM_START returns fast.
 *
 * Freestyle docs: /v2/vms, /v2/vms/configuration/systemd-services,
 * /v2/vms/configuration/ports-networking, /v2/vms/configuration/domains
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { freestyle } from "freestyle-sandboxes";
import { type VmEntry, patchActiveVms } from "./types";
import { requireVmEntry, resolveRuntimeConfig } from "./helpers";

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

    // Resume existing VM if one is tracked.
    // Try vm.start() which resumes suspended/stopped VMs. If the VM was
    // deleted externally, the call will throw — clear the stale entry and
    // fall through to create a new one.
    const existing = metadata.activeVms?.[userId];
    if (existing) {
      try {
        const vm = freestyle.vms.ref({ vmId: existing.vmId });
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

    if (!metadata.githubRepo) {
      throw new Error("No GitHub repo connected");
    }

    const { owner, name } = metadata.githubRepo;
    const { detected, port, needsRuntimeInstall } =
      resolveRuntimeConfig(metadata);

    // Create the Freestyle Git repo reference
    const { repoId } = await freestyle.git.repos.create({
      source: {
        url: `https://github.com/${owner}/${name}`,
      },
    });

    // Generate a unique subdomain for this VM
    // Freestyle docs: /v2/vms/configuration/domains
    const previewDomain = `${input.virtualMcpId.replace(/[^a-z0-9]/gi, "-")}.deco.studio`;
    const terminalDomain = `${input.virtualMcpId.replace(/[^a-z0-9]/gi, "-")}-term.deco.studio`;

    // Setup script for deno/bun runtimes — kept as additionalFile for VM_EXEC
    const setupScript =
      detected === "deno"
        ? '#!/bin/bash\nset -e\nexport DENO_INSTALL="/usr/local"\ncurl -fsSL https://deno.land/install.sh | sh\necho "Deno installed to /usr/local/bin"\n'
        : detected === "bun"
          ? '#!/bin/bash\nset -e\nexport BUN_INSTALL="/usr/local"\ncurl -fsSL https://bun.sh/install | bash\necho "Bun installed to /usr/local/bin"\n'
          : "";

    // Reverse proxy that strips X-Frame-Options and CSP headers so the
    // dev server preview can be embedded in an iframe.
    // For HTML responses, injects a bootstrap script that listens for
    // visual-editor::activate postMessage to enable the visual editor.
    // Node's http module is available in Freestyle VMs by default.
    const proxyPort = 9000;
    const bootstrapScript = `<script>(function(){window.addEventListener("message",function(e){if(e.data&&e.data.type==="visual-editor::activate"&&e.data.script){try{new Function(e.data.script)()}catch(err){console.error("[visual-editor] injection failed",err)}}});})();</script>`;
    const proxyScript = `const http = require("http");
const UPSTREAM = process.env.UPSTREAM_PORT || "3000";
const BOOTSTRAP = ${JSON.stringify(bootstrapScript)};
http.createServer((req, res) => {
  const hdrs = Object.assign({}, req.headers);
  // Remove accept-encoding so upstream sends uncompressed responses.
  // The proxy needs to read and modify HTML as plain text.
  delete hdrs["accept-encoding"];
  const opts = { hostname: "127.0.0.1", port: UPSTREAM, path: req.url, method: req.method, headers: hdrs };
  const p = http.request(opts, (upstream) => {
    delete upstream.headers["x-frame-options"];
    delete upstream.headers["content-security-policy"];
    delete upstream.headers["content-encoding"];
    const ct = (upstream.headers["content-type"] || "").toLowerCase();
    if (ct.includes("text/html")) {
      // Buffer HTML responses to inject the visual editor bootstrap
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
}).listen(${proxyPort}, "0.0.0.0");
`;

    // Node.js-based log viewer — replaces ttyd to avoid external downloads.
    // Serves an HTML page that streams /tmp/vm.log via SSE.
    const terminalPort = 7682;
    const logViewerScript = `const http = require("http");
const fs = require("fs");
const LOG = "/tmp/vm.log";
const HTML = \`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>VM Log</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#1e1e1e;color:#d4d4d4;font:13px/1.5 "Cascadia Code","Fira Code",Consolas,monospace;overflow:hidden}
#log{white-space:pre-wrap;word-break:break-all;padding:8px 12px;height:100vh;overflow-y:auto}
</style></head><body><pre id="log"></pre>
<script>
const el=document.getElementById("log");
const es=new EventSource("/stream");
es.onmessage=e=>{el.textContent+=e.data+"\\n";el.scrollTop=el.scrollHeight};
es.onerror=()=>{setTimeout(()=>es.close(),1000);setTimeout(()=>location.reload(),3000)};
</script></body></html>\`;

http.createServer((req, res) => {
  if (req.url === "/stream") {
    res.writeHead(200, {"Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive","Access-Control-Allow-Origin":"*"});
    // Send existing content
    try { const c = fs.readFileSync(LOG,"utf-8"); if(c) res.write("data: "+c.replace(/\\n/g,"\\ndata: ")+"\\n\\n"); } catch {}
    // Watch for changes
    let pos = 0;
    try { pos = fs.statSync(LOG).size; } catch {}
    const iv = setInterval(() => {
      try {
        const st = fs.statSync(LOG);
        if (st.size < pos) pos = 0; // file was truncated
        if (st.size > pos) {
          const buf = Buffer.alloc(st.size - pos);
          const fd = fs.openSync(LOG, "r");
          fs.readSync(fd, buf, 0, buf.length, pos);
          fs.closeSync(fd);
          pos = st.size;
          const text = buf.toString("utf-8");
          res.write("data: " + text.replace(/\\n/g, "\\ndata: ") + "\\n\\n");
        }
      } catch {}
    }, 500);
    req.on("close", () => clearInterval(iv));
    return;
  }
  if (req.url === "/token") { res.writeHead(200, {"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}); res.end("{}"); return; }
  res.writeHead(200, {"Content-Type":"text/html"}); res.end(HTML);
}).listen(${terminalPort}, "0.0.0.0");
`;

    const additionalFiles: Record<string, { content: string }> = {
      "/opt/iframe-proxy.js": { content: proxyScript },
      "/opt/log-viewer.js": { content: logViewerScript },
    };
    if (needsRuntimeInstall) {
      additionalFiles["/opt/setup-runtime.sh"] = { content: setupScript };
    }

    // Build systemd services list — infrastructure only.
    // Install/dev lifecycle is handled by VM_EXEC.
    // Freestyle docs: /v2/vms/configuration/systemd-services

    const services: Array<{
      name: string;
      mode: "oneshot" | "service";
      exec: string[];
      workdir?: string;
      after?: string[];
      requires?: string[];
      wantedBy?: string[];
      timeoutSec?: number;
      remainAfterExit?: boolean;
      env?: Record<string, string>;
    }> = [
      {
        name: "web-terminal",
        mode: "service",
        exec: [
          `bash -c 'touch /tmp/vm.log && exec /usr/local/bin/node /opt/log-viewer.js'`,
        ],
      },
      {
        name: "iframe-proxy",
        mode: "service",
        exec: [`/usr/local/bin/node /opt/iframe-proxy.js`],
        env: {
          UPSTREAM_PORT: port,
        },
      },
    ];

    // Create VM with repo and systemd services.
    // Domain routes to the iframe proxy which strips X-Frame-Options/CSP
    // so the preview can be embedded in an iframe.
    // Freestyle docs: /v2/vms/configuration/domains
    const createResult = await freestyle.vms.create({
      gitRepos: [{ repo: repoId, path: "/app" }],
      workdir: "/app",
      domains: [
        { domain: previewDomain, vmPort: proxyPort },
        { domain: terminalDomain, vmPort: terminalPort },
      ],
      additionalFiles,
      systemd: { services },
      idleTimeoutSeconds: 1800,
    });

    console.log(
      `[VM_START] VM created: ${createResult.vmId} domain: ${previewDomain} terminal: ${terminalDomain}`,
    );

    const { vmId } = createResult;

    const previewUrl = `https://${previewDomain}`;
    const terminalUrl = `https://${terminalDomain}`;
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

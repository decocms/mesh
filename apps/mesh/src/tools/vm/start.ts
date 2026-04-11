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

import { createHash } from "node:crypto";
import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { VmSpec, freestyle } from "freestyle-sandboxes";
import { VmDeno } from "@freestyle-sh/with-deno";
import { VmBun } from "@freestyle-sh/with-bun";
import { VmNodeJs } from "@freestyle-sh/with-nodejs";
import { VmWebTerminal } from "@freestyle-sh/with-web-terminal";
import { type VmEntry, patchActiveVms } from "./types";
import { requireVmEntry, resolveRuntimeConfig } from "./helpers";

const PROXY_PORT = 9000;

const BOOTSTRAP_SCRIPT = `<script>(function(){window.addEventListener("message",function(e){if(e.data&&e.data.type==="visual-editor::activate"&&e.data.script){try{new Function(e.data.script)()}catch(err){console.error("[visual-editor] injection failed",err)}}});})();</script>`;

// Reverse proxy that strips X-Frame-Options and CSP headers so the
// dev server preview can be embedded in an iframe.
// For HTML responses, injects a bootstrap script that listens for
// visual-editor::activate postMessage to enable the visual editor.
// Node's http module is available in Freestyle VMs by default.
const buildProxyScript = (
  upstreamPort: string,
) => `const http = require("http");
const fs = require("fs");
const UPSTREAM = "${upstreamPort}";
const LOG = "/tmp/vm.log";
const log = (msg) => { const line = new Date().toISOString() + " [iframe-proxy] " + msg + "\\n"; fs.appendFileSync(LOG, line); };
const BOOTSTRAP = ${JSON.stringify(BOOTSTRAP_SCRIPT)};
log("starting — upstream=:" + UPSTREAM + " listen=:" + ${PROXY_PORT});
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
  p.on("error", (e) => { log("proxy error: " + e.message); res.writeHead(502); res.end("proxy error: " + e.message); });
  req.pipe(p);
}).listen(${PROXY_PORT}, "0.0.0.0", () => { log("listening on :" + ${PROXY_PORT}); });
`;

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
    const { detected, port } = resolveRuntimeConfig(metadata);

    // Generate a unique subdomain per (virtualMcpId, userId) pair.
    // MD5 of the composite key guarantees a valid, fixed-length hex subdomain
    // and avoids collisions between different users on the same Virtual MCP.
    // Freestyle docs: /v2/vms/configuration/domains
    const domainKey = createHash("md5")
      .update(`${input.virtualMcpId}:${userId}`)
      .digest("hex")
      .slice(0, 16);
    const previewDomain = `${domainKey}.deco.studio`;
    const terminalDomain = `${domainKey}-term.deco.studio`;

    // Build the full VmSpec declaratively — integrations, repo, files, and services.
    // VmNodeJs is always included: the iframe-proxy systemd service runs Node.js on every VM.
    // Freestyle docs: /v2/vms/integrations/deno, /v2/vms/integrations/bun, /v2/vms/integrations/web-terminal
    const baseSpec = new VmSpec()
      .with(
        "terminal",
        new VmWebTerminal([
          { id: "logs", command: "tail -f /tmp/vm.log", readOnly: true },
        ] as const),
      )
      .with("node", new VmNodeJs())
      .repo(`https://github.com/${owner}/${name}`, "/app")
      .additionalFiles({
        "/opt/iframe-proxy.js": { content: buildProxyScript(port) },
        "/opt/run-iframe-proxy.sh": {
          content:
            "#!/bin/bash\nsource /etc/profile.d/nvm.sh\nexec node /opt/iframe-proxy.js\n",
        },
        "/tmp/vm.log": { content: "" },
      })
      .systemdService({
        name: "iframe-proxy",
        mode: "service",
        exec: ["/bin/bash /opt/run-iframe-proxy.sh"],
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

    console.log(`[VM_START] detected runtime: ${detected}`);

    // Create VM from spec.
    // Domain routes to the iframe proxy which strips X-Frame-Options/CSP
    // so the preview can be embedded in an iframe.
    // Terminal domain is routed post-creation via vm.terminal.logs.route() — a persistent mapping.
    // Freestyle docs: /v2/vms/configuration/domains
    const createResult = await freestyle.vms.create({
      spec,
      domains: [{ domain: previewDomain, vmPort: PROXY_PORT }],
      idleTimeoutSeconds: 1800,
    });

    console.log(
      `[VM_START] VM created: ${createResult.vmId} domain: ${previewDomain} terminal: ${terminalDomain}`,
    );

    const { vmId } = createResult;

    const previewUrl = `https://${previewDomain}`;

    // Route the terminal domain to ttyd. This creates a persistent domain mapping
    // (same infrastructure as domains:[]) — only needed once at VM creation.
    // Survives VM resumes — ttyd comes back automatically via restart: always.
    let terminalUrl: string | null = null;
    try {
      await createResult.vm.terminal.logs.route({ domain: terminalDomain });
      terminalUrl = `https://${terminalDomain}`;
    } catch (err) {
      console.warn(
        `[VM_START] route() failed for terminal domain — VM will have no terminal URL: ${err}`,
      );
    }

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

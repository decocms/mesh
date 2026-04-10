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

    // Return existing VM if one is still reachable.
    // If the VM was force-deleted externally, the preview URL returns 503
    // from Freestyle's CDN. Detect this and clear the stale entry so a
    // fresh VM is created below.
    const existing = metadata.activeVms?.[userId];
    if (existing) {
      try {
        const res = await fetch(existing.previewUrl, { method: "HEAD" });
        if (res.status !== 503) {
          return { ...existing, isNewVm: false };
        }
      } catch {
        // Network error — treat as reachable (could be transient)
        return { ...existing, isNewVm: false };
      }
      // 503 — VM is dead, clear stale entry and fall through to create a new one
      console.log(
        `[VM_START] Stale VM detected (503): ${existing.vmId}, clearing entry`,
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

    // Install ttyd to /tmp/ — Freestyle VM overlay filesystem restricts
    // writes to /usr/local/bin/ and /opt/ at runtime (curl error 23).
    const ttydVersion = "1.7.7";
    const installTtydScript = `#!/bin/bash
set -e
TTYD_URL="https://github.com/tsl0922/ttyd/releases/download/${ttydVersion}/ttyd.x86_64"
DEST="/tmp/ttyd"
for i in 1 2 3; do
  if curl -fsSL --retry 3 --retry-delay 2 -o "$DEST" "$TTYD_URL"; then
    chmod +x "$DEST"
    "$DEST" --version
    exit 0
  fi
  echo "ttyd download attempt $i failed, retrying in 5s..."
  sleep 5
done
echo "ttyd download failed"
exit 1
`;

    const additionalFiles: Record<string, { content: string }> = {
      "/opt/iframe-proxy.js": { content: proxyScript },
      "/opt/install-ttyd.sh": { content: installTtydScript },
    };
    if (needsRuntimeInstall) {
      additionalFiles["/opt/setup-runtime.sh"] = { content: setupScript };
    }

    // Build systemd services list — infrastructure only.
    // Install/dev lifecycle is handled by VM_EXEC.
    // Freestyle docs: /v2/vms/configuration/systemd-services
    const terminalPort = 7682;

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
        name: "install-ttyd",
        mode: "oneshot",
        exec: ["/bin/bash /opt/install-ttyd.sh"],
        wantedBy: ["multi-user.target"],
        timeoutSec: 180,
        remainAfterExit: true,
      },
      {
        name: "web-terminal",
        mode: "service",
        exec: [
          `bash -c 'touch /tmp/vm.log && exec /tmp/ttyd -p ${terminalPort} --readonly tail -f /tmp/vm.log'`,
        ],
        after: ["install-ttyd.service"],
        requires: ["install-ttyd.service"],
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

/**
 * VM_START Tool
 *
 * Creates a Freestyle VM with the connected GitHub repo
 * and systemd services for install + dev.
 * App-only tool — not visible to AI models.
 *
 * Freestyle docs: /v2/vms, /v2/vms/configuration/systemd-services,
 * /v2/vms/configuration/ports-networking, /v2/vms/configuration/domains
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  requireAuth,
  requireOrganization,
  getUserId,
} from "../../core/mesh-context";
import { freestyle } from "freestyle-sandboxes";
import { type VmEntry, type VmMetadata, patchActiveVms } from "./types";

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
  }),

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required");
    }

    // Fetch the virtual MCP first — needed for both the existing-VM check
    // and the creation config below.
    const virtualMcp = await ctx.storage.virtualMcps.findById(
      input.virtualMcpId,
    );
    if (!virtualMcp) {
      throw new Error("Virtual MCP not found");
    }

    // Org-scope guard: ensure this Virtual MCP belongs to the caller's org.
    if (virtualMcp.organization_id !== organization.id) {
      throw new Error("Virtual MCP not found");
    }

    const metadata = virtualMcp.metadata as VmMetadata;

    // Return existing VM if one is already running for this user + virtual MCP.
    // NOTE: this entry may be stale if the Freestyle VM was force-deleted
    // externally. In that case the returned previewUrl will 502. A liveness
    // check is deferred as a follow-up.
    const existing = metadata.activeVms?.[userId];
    if (existing) {
      return existing;
    }

    if (!metadata.githubRepo) {
      throw new Error("No GitHub repo connected");
    }

    const { owner, name } = metadata.githubRepo;
    const installScript = metadata.runtime?.installScript ?? "npm install";
    const devScript = metadata.runtime?.devScript ?? "npm run dev";
    const detected = metadata.runtime?.detected ?? "npm";
    const port = metadata.runtime?.port ?? "3000";

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

    // Determine if we need to install a runtime (deno/bun).
    // Node/npm is available by default in Freestyle VMs.
    // We install to /usr/local/ so the binary lands in /usr/local/bin/,
    // which is in systemd's default PATH — no PATH hacks needed.
    const needsRuntimeInstall = detected === "deno" || detected === "bun";

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

    // Install ttyd to /opt/ (writable) — /usr/local/bin/ is read-only
    // in Freestyle VMs which causes curl write errors.
    const ttydVersion = "1.7.7";
    const installTtydScript = `#!/bin/bash
set -e
TTYD_URL="https://github.com/tsl0922/ttyd/releases/download/${ttydVersion}/ttyd.x86_64"
DEST="/opt/ttyd"
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

    // Build systemd services list
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
    }> = [];

    if (needsRuntimeInstall) {
      services.push({
        name: "setup-runtime",
        mode: "oneshot",
        exec: ["/bin/bash /opt/setup-runtime.sh"],
        wantedBy: ["multi-user.target"],
        timeoutSec: 120,
        remainAfterExit: true,
      });
    }

    services.push({
      name: "install-deps",
      mode: "oneshot",
      exec: [installScript],
      workdir: "/app",
      after: [
        "freestyle-git-sync.service",
        ...(needsRuntimeInstall ? ["setup-runtime.service"] : []),
      ],
      requires: needsRuntimeInstall ? ["setup-runtime.service"] : undefined,
      wantedBy: ["multi-user.target"],
      timeoutSec: 300,
      remainAfterExit: true,
    });

    services.push({
      name: "dev-server",
      mode: "service",
      exec: [devScript],
      workdir: "/app",
      after: ["install-deps.service"],
      requires: ["install-deps.service"],
      env: {
        HOST: "0.0.0.0",
        HOSTNAME: "0.0.0.0",
        PORT: port,
      },
    });

    // Reverse proxy strips iframe-blocking headers (X-Frame-Options, CSP)
    services.push({
      name: "iframe-proxy",
      mode: "service",
      exec: [`/usr/local/bin/node /opt/iframe-proxy.js`],
      after: ["dev-server.service"],
      env: {
        UPSTREAM_PORT: port,
      },
    });

    // Install and run ttyd (web terminal) so the frontend can embed it.
    const terminalPort = 7682;

    services.push({
      name: "install-ttyd",
      mode: "oneshot",
      exec: ["/bin/bash /opt/install-ttyd.sh"],
      wantedBy: ["multi-user.target"],
      timeoutSec: 180,
      remainAfterExit: true,
    });

    services.push({
      name: "web-terminal",
      mode: "service",
      exec: [`/opt/ttyd -p ${terminalPort} --writable bash -l`],
      workdir: "/app",
      after: ["install-ttyd.service", "freestyle-git-sync.service"],
      requires: ["install-ttyd.service"],
    });

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

    return entry;
  },
});

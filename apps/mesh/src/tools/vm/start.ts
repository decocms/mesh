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
import { requireAuth, getUserId } from "../../core/mesh-context";
import { freestyle } from "freestyle-sandboxes";
import { getActiveVm, setActiveVm } from "./registry";

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
    await ctx.access.check();

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required");
    }

    // Return existing VM if one is already running for this user + virtual MCP
    const existing = getActiveVm(input.virtualMcpId, userId);
    if (existing) {
      return existing;
    }

    const virtualMcp = await ctx.storage.virtualMcps.findById(
      input.virtualMcpId,
    );
    if (!virtualMcp) {
      throw new Error("Virtual MCP not found");
    }

    const metadata = virtualMcp.metadata as {
      githubRepo?: {
        url: string;
        owner: string;
        name: string;
      } | null;
      runtime?: {
        detected: string | null;
        selected: string | null;
        installScript?: string | null;
        devScript?: string | null;
        port?: string | null;
      } | null;
    };

    if (!metadata.githubRepo) {
      throw new Error("No GitHub repo connected");
    }

    const { owner, name } = metadata.githubRepo;
    const installScript = metadata.runtime?.installScript ?? "npm install";
    const devScript = metadata.runtime?.devScript ?? "npm run dev";
    const detected = metadata.runtime?.detected ?? "npm";
    const port = metadata.runtime?.port ?? "3000";
    const portNum = parseInt(port, 10);

    // Create the Freestyle Git repo reference
    const { repoId } = await freestyle.git.repos.create({
      source: {
        url: `https://github.com/${owner}/${name}`,
      },
    });

    // Generate a unique subdomain for this VM
    // Freestyle docs: /v2/vms/configuration/domains
    const previewDomain = `${input.virtualMcpId.replace(/[^a-z0-9]/gi, "-")}.deco.studio`;

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

    const additionalFiles: Record<string, { content: string }> = {};
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

    // Create VM with repo and systemd services.
    // Domain maps directly to dev server port — no socat proxy needed.
    // Freestyle docs: /v2/vms/configuration/domains
    const createResult = await freestyle.vms.create({
      gitRepos: [{ repo: repoId, path: "/app" }],
      workdir: "/app",
      domains: [{ domain: previewDomain, vmPort: portNum }],
      additionalFiles,
      systemd: { services },
    });

    console.log(
      `[VM_START] VM created: ${createResult.vmId} domain: ${previewDomain}`,
    );

    const { vmId } = createResult;
    const previewUrl = `https://${previewDomain}`;
    const entry = { terminalUrl: null, previewUrl, vmId };

    setActiveVm(input.virtualMcpId, userId, entry);

    return entry;
  },
});

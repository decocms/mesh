/**
 * VM_START Tool
 *
 * Creates a Freestyle VM with the connected GitHub repo,
 * Web Terminal (read-only), and systemd services for install + dev.
 * App-only tool — not visible to AI models.
 *
 * Freestyle docs: /v2/vms, /v2/vms/configuration/systemd-services,
 * /v2/vms/integrations/web-terminal, /v2/vms/configuration/ports-networking
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";
import { freestyle } from "freestyle-sandboxes";
import { VmNodeJs } from "@freestyle-sh/with-nodejs";
import { VmBun } from "@freestyle-sh/with-bun";

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
      } | null;
    };

    if (!metadata.githubRepo) {
      throw new Error("No GitHub repo connected");
    }

    const { owner, name } = metadata.githubRepo;
    const installScript = metadata.runtime?.installScript ?? "npm install";
    const devScript = metadata.runtime?.devScript ?? "npm run dev";
    const detected = metadata.runtime?.detected ?? "npm";

    // Select runtime integration based on detected package manager
    const runtimeIntegration =
      detected === "bun" ? new VmBun() : new VmNodeJs();

    // Create the Freestyle Git repo reference
    const { repoId } = await freestyle.git.repos.create({
      source: {
        url: `https://github.com/${owner}/${name}`,
      },
    });

    // Create VM with runtime, repo, and systemd services
    // Freestyle docs: /v2/vms/configuration/systemd-services
    const { vmId, domains } = await freestyle.vms.create({
      with: {
        runtime: runtimeIntegration,
      },
      gitRepos: [{ repo: repoId, path: "/app" }],
      workdir: "/app",
      ports: [{ port: 443, targetPort: 3000 }],
      systemd: {
        services: [
          {
            name: "install-deps",
            mode: "oneshot" as const,
            exec: [installScript],
            workdir: "/app",
            after: ["freestyle-git-sync.service"],
            wantedBy: ["multi-user.target"],
            timeoutSec: 300,
          },
          {
            name: "dev-server",
            mode: "service" as const,
            exec: [devScript],
            workdir: "/app",
            after: ["install-deps.service"],
            env: {
              HOST: "0.0.0.0",
              PORT: "3000",
            },
          },
        ],
      },
    });

    const previewUrl = `https://${domains[0]}`;

    return { terminalUrl: null, previewUrl, vmId };
  },
});

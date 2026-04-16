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
import { buildDaemonScript } from "./daemon";

const PROXY_PORT = 9000;

const BOOTSTRAP_SCRIPT = `<script>(function(){window.addEventListener("message",function(e){if(e.data&&e.data.type==="visual-editor::activate"&&e.data.script){try{new Function(e.data.script)()}catch(err){console.error("[visual-editor] injection failed",err)}}});})();</script>`;

/**
 * Fetches the GitHub OAuth token and user profile from downstream_tokens.
 * Returns the authenticated git clone URL and the user's git identity.
 */
async function buildCloneInfo(
  connectionId: string,
  owner: string,
  name: string,
  db: import("kysely").Kysely<import("../../storage/types").Database>,
  vault: import("../../encryption/credential-vault").CredentialVault,
): Promise<{ cloneUrl: string; gitUserName: string; gitUserEmail: string }> {
  const tokenStorage = new DownstreamTokenStorage(db, vault);
  const token = await tokenStorage.get(connectionId);
  if (!token) {
    throw new Error(
      "No GitHub token found. Ensure the mcp-github connection is authenticated.",
    );
  }
  const cloneUrl = `https://x-access-token:${token.accessToken}@github.com/${owner}/${name}.git`;

  let gitUserName = "Deco Studio";
  let gitUserEmail = "studio@deco.cx";
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${token.accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (res.ok) {
      const user = (await res.json()) as {
        name?: string | null;
        login: string;
        email?: string | null;
      };
      gitUserName = user.name || user.login;
      gitUserEmail = user.email || `${user.login}@users.noreply.github.com`;
    }
  } catch {
    // Fallback to defaults — don't block VM start
  }

  return { cloneUrl, gitUserName, gitUserEmail };
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
    try {
      const { metadata, userId } = await requireVmEntry(input, ctx);

      if (!metadata.githubRepo) {
        throw new Error("No GitHub repo connected");
      }

      const { owner, name } = metadata.githubRepo;
      const { packageManager, runtime, port, runtimeBinPath } =
        resolveRuntimeConfig(metadata);
      const pathPrefix = runtimeBinPath
        ? `export PATH=${runtimeBinPath}:$PATH && `
        : "";

      // Build authenticated clone URL and git identity from downstream token
      const { cloneUrl, gitUserName, gitUserEmail } = await buildCloneInfo(
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
              packageManager,
              pathPrefix,
              port,
              cloneUrl,
              repoName: `${owner}/${name}`,
              proxyPort: PROXY_PORT,
              bootstrapScript: BOOTSTRAP_SCRIPT,
              gitUserName,
              gitUserEmail,
            }),
          },
          "/opt/run-daemon.sh": {
            content:
              "#!/bin/bash\nsource /etc/profile.d/nvm.sh\nexec node /opt/daemon.js\n",
          },
          "/opt/install-ripgrep.sh": {
            content:
              "#!/bin/bash\napt-get update -qq && apt-get install -y -qq ripgrep locales && sed -i 's/^#\\s*en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen && locale-gen\n",
          },
          "/opt/prepare-app-dir.sh": {
            content:
              "#!/bin/bash\nid -u deco &>/dev/null || useradd -m -u 1000 deco\nmkdir -p /app && chown deco:deco /app\n",
          },
        })
        .systemdService({
          name: "install-ripgrep",
          mode: "oneshot",
          exec: ["/bin/bash /opt/install-ripgrep.sh"],
          wantedBy: ["multi-user.target"],
        })
        .systemdService({
          name: "prepare-app-dir",
          mode: "oneshot",
          exec: ["/bin/bash /opt/prepare-app-dir.sh"],
          wantedBy: ["multi-user.target"],
        })
        .systemdService({
          name: "daemon",
          mode: "service",
          exec: ["/bin/bash /opt/run-daemon.sh"],
          after: [
            "install-nodejs.service",
            "install-ripgrep.service",
            "prepare-app-dir.service",
          ],
          requires: [
            "install-nodejs.service",
            "install-ripgrep.service",
            "prepare-app-dir.service",
          ],
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
      if (existing) {
        try {
          const vm = freestyle.vms.ref({ vmId: existing.vmId, spec });
          await vm.start();
          return { ...existing, isNewVm: false };
        } catch {
          // VM no longer exists on Freestyle — clear stale entry
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
    } catch (e) {
      console.error("[VM_START] error", e);
      throw e;
    }
  },
});

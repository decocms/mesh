/**
 * VM_START Tool
 *
 * Creates a sandbox with the connected GitHub repo, populates the Virtual
 * MCP's `activeVms[userId]` entry, and returns the preview URL the frontend
 * embeds in the iframe. App-only tool — not visible to AI models.
 *
 * Dispatches on `MESH_SANDBOX_RUNNER`:
 *  - "freestyle" → spins up a Freestyle VM with in-VM iframe-proxy/daemon.
 *    Install + dev lifecycle runs in the VM daemon so VM_START returns fast.
 *    Freestyle docs: /v2/vms, /v2/vms/configuration/systemd-services,
 *    /v2/vms/configuration/ports-networking, /v2/vms/configuration/domains.
 *  - "docker" → reuses the shared DockerSandboxRunner. The preview URL is a
 *    relative mesh proxy path; the container's dev-server port is bound to
 *    127.0.0.1 and forwarded via /api/sandbox/:handle/preview/:port/. Repo
 *    clone happens inside the runner; the user is expected to start the dev
 *    server manually via the `bash` tool (preview-lifecycle automation is
 *    deferred).
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
import { buildCloneInfo } from "../../shared/github-clone-info";
import { buildDaemonScript } from "./daemon";
import type { MeshContext } from "../../core/mesh-context";
import { DockerSandboxRunner } from "mesh-plugin-user-sandbox/runner";
import { getSharedRunner } from "../../sandbox/shared-runner";
import { resolvePrepImage } from "../../sandbox/prep-enqueue";
import { mintSandboxRef } from "../../sandbox/sandbox-ref";

const PROXY_PORT = 9000;

/**
 * Compose the pod-public sandbox URL for a given handle. Reads
 * `SANDBOX_ROOT_URL` at call time so deploys can rewrite it without a build.
 * Default: `http://<handle>.sandboxes.localhost:<SANDBOX_INGRESS_PORT|7070>/`.
 */
export function composeSandboxUrl(handle: string): string {
  const root = process.env.SANDBOX_ROOT_URL;
  if (root) {
    const base = root.replace(/\/+$/, "");
    // Template: `{handle}` placeholder lets prod use something like
    // `https://{handle}.sandboxes.example.com` without shell escaping.
    if (base.includes("{handle}"))
      return `${base.replace("{handle}", handle)}/`;
    // Absent placeholder, inject as a leading subdomain.
    try {
      const u = new URL(base);
      u.hostname = `${handle}.${u.hostname}`;
      return `${u.toString()}/`;
    } catch {
      // Fall through to local default below.
    }
  }
  const ingressPort = Number(process.env.SANDBOX_INGRESS_PORT ?? 7070);
  return `http://${handle}.sandboxes.localhost:${ingressPort}/`;
}

function resolveRunnerKind(): "docker" | "freestyle" {
  const raw = process.env.MESH_SANDBOX_RUNNER;
  if (raw === "docker" || raw === "freestyle") return raw;
  // Freestyle stays the default for the hosted control plane. Explicit opt-in
  // via the env var picks docker for local dev.
  return "freestyle";
}

const BOOTSTRAP_SCRIPT = `<script>(function(){window.addEventListener("message",function(e){if(e.data&&e.data.type==="visual-editor::activate"&&e.data.script){try{new Function(e.data.script)()}catch(err){console.error("[visual-editor] injection failed",err)}}});})();</script>`;

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
    threadId: z
      .string()
      .optional()
      .describe(
        "Current thread id. Required for the Docker runner — its sandbox is keyed off the thread's sandbox_ref so bash and the preview iframe share one container.",
      ),
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

      if (resolveRunnerKind() === "docker") {
        // Docker path supports repo-less spin (bun base image, no clone).
        return await dockerStart(input, ctx, metadata, userId);
      }

      // Freestyle path needs a repo: its daemon script hardcodes cloneUrl.
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
          restartPolicy: {
            policy: "always",
            restartSec: 2,
          },
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

/**
 * Docker-backed VM_START path.
 *
 * The container is keyed off the thread's `sandbox_ref` so bash and the
 * preview iframe share one lifecycle. The browser reaches the dev server
 * through the `/api/sandbox/:handle/preview/:port/` mesh proxy, so the
 * `previewUrl` we return is a relative mesh path. Starting the dev server
 * is still a manual step — see the MVP note in the module docstring.
 *
 * Note: the Docker path no longer writes to `activeVms`. The preview panel
 * reads its URL from the thread-scoped
 * `GET /api/:org/decopilot/threads/:threadId/sandbox` endpoint, so we only
 * need to return `{ previewUrl, vmId, isNewVm }` to the caller.
 */
async function dockerStart(
  input: { virtualMcpId: string; threadId?: string },
  ctx: MeshContext,
  metadata: {
    githubRepo?: { owner: string; name: string; connectionId: string } | null;
  },
  userId: string,
) {
  if (!input.threadId) {
    throw new Error(
      "VM_START (docker runner): threadId is required — pass the current thread id so the sandbox stays keyed off thread.sandbox_ref",
    );
  }

  // The env panel can be clicked before any chat message has been sent — at
  // that point the thread row doesn't exist yet. Create it eagerly with a
  // fresh sandbox_ref so VM_START works in the zero-message case. If the row
  // already exists but sandbox_ref is null (legacy thread), populate it now.
  //
  // `mintSandboxRef` must match the one in createMemory — both can race to
  // create the same thread row, and a mismatched ref would spawn an orphan
  // container before the DB write settled.
  let thread = await ctx.storage.threads.get(input.threadId);
  if (!thread) {
    thread = await ctx.storage.threads.create({
      id: input.threadId,
      created_by: userId,
      virtual_mcp_id: input.virtualMcpId,
      sandbox_ref: mintSandboxRef(),
    });
  } else if (!thread.sandbox_ref) {
    thread = await ctx.storage.threads.update(thread.id, {
      sandbox_ref: mintSandboxRef(),
    });
  }
  const sandboxRef = thread.sandbox_ref;
  if (!sandboxRef) {
    throw new Error(
      "VM_START (docker runner): failed to assign sandbox_ref to thread",
    );
  }

  const repo = metadata.githubRepo ?? null;

  // Repo-less spin: container boots from the default bun image with an empty
  // workdir. No clone, no prep image, no dev-server auto-start. Useful so the
  // sandbox is ready for bash before the user connects a repo.
  const repoInfo = repo
    ? await buildCloneInfo(
        repo.connectionId,
        repo.owner,
        repo.name,
        ctx.db,
        ctx.vault,
      )
    : null;

  const runner = getSharedRunner(ctx);
  // Pull user-defined env vars so `docker run -e KEY=VALUE` injects them at
  // provision time. Unchanged for existing containers — docker args are only
  // consulted on fresh provision. To apply new values the caller must
  // VM_DELETE first, then VM_START.
  const userEnv = await ctx.storage.sandboxEnv.resolve(sandboxRef);
  // Spawn from a pre-baked prep image when one is ready for this (user, repo).
  // Cuts clone + install from the first-start latency budget.
  const prepImage = repo
    ? await resolvePrepImage(ctx, userId, {
        owner: repo.owner,
        name: repo.name,
        connectionId: repo.connectionId,
      })
    : null;
  const { runtime } = resolveRuntimeConfig(metadata);
  const sandbox = await runner.ensure(
    {
      userId,
      projectRef: sandboxRef,
    },
    {
      repo: repoInfo
        ? {
            cloneUrl: repoInfo.cloneUrl,
            userName: repoInfo.gitUserName,
            userEmail: repoInfo.gitUserEmail,
          }
        : undefined,
      env: { ...userEnv },
      image: prepImage ?? undefined,
    },
  );

  // Kick off the dev server now that `ensure()` has guaranteed the clone is
  // complete. Idempotent — the daemon's `/_daemon/dev/start` no-ops when
  // phase is already starting/installing/ready, so repeated calls from page
  // polls (see decopilot/routes.ts) are safe. Skipped for repo-less spins:
  // no package.json means nothing to run.
  if (repo && runner instanceof DockerSandboxRunner) {
    // `runtime` tells the sandbox daemon which toolchain to use. Deno in
    // particular is lazy-installed into the container on first use, and the
    // daemon reads tasks from `deno.json` instead of `package.json.scripts`
    // — so a wrong guess here means the dev server never starts.
    const devBody: Record<string, unknown> = {
      runtime: runtime ?? undefined,
    };
    runner
      .proxyDaemonRequest(sandbox.handle, "/_daemon/dev/start", {
        method: "POST",
        headers: new Headers({ "content-type": "application/json" }),
        body: JSON.stringify(devBody),
      })
      .catch((err) => {
        console.error(
          `[VM_START] /dev/start failed for ${sandbox.handle}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  // Preview URL points at the pod's own public host (no mesh in the middle
  // for dev traffic). Local dev resolves via dnsmasq + the local ingress
  // forwarder bound in index.ts; prod resolves via the wildcard ingress.
  const previewUrl = composeSandboxUrl(sandbox.handle);
  const entry: VmEntry = {
    vmId: sandbox.handle,
    previewUrl,
    terminalUrl: null,
  };

  // Intentionally DON'T write to activeVms on the docker path. activeVms
  // is what switches the decopilot tool set from `bash` (QuickJS/daemon
  // backed) to the Freestyle in-VM file tools — those hit
  // `<previewUrl>/_decopilot_vm/*` and would target the dev-server port we
  // just published, not the sandbox daemon. The env panel and preview panel
  // both read running state from the thread-scoped sandbox endpoint for the
  // docker runner.

  return { ...entry, isNewVm: true };
}

/**
 * VM_START Tool
 *
 * Starts a sandbox with the connected GitHub repo, keyed by (userId, branch)
 * in the Virtual MCP's `vmMap`. App-only tool — not visible to AI models.
 *
 * Dispatches on `MESH_SANDBOX_RUNNER`:
 *  - "freestyle" → spins up a Freestyle VM with in-VM iframe-proxy/daemon.
 *    Install + dev lifecycle runs in the VM daemon so VM_START returns fast.
 *    Freestyle docs: /v2/vms, /v2/vms/configuration/systemd-services,
 *    /v2/vms/configuration/ports-networking, /v2/vms/configuration/domains.
 *  - "docker" → reuses the shared DockerSandboxRunner. The preview URL points
 *    at the sandbox ingress (`<handle>.sandboxes.<root>/`); daemon calls are
 *    mesh-proxied via `/api/sandbox/:handle/_daemon/*` so the browser doesn't
 *    need the daemon bearer token.
 *
 * Branch semantics: the tool accepts an optional `branch`. When omitted it
 * generates `decopilot/<adjective>-<noun>`. The resolved branch is returned
 * so the client can persist it. Docker currently clones the default branch
 * regardless of `branch` (TODO: per-branch clone). Freestyle's in-VM daemon
 * respects the branch during clone.
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import type { VmMapEntry } from "@decocms/mesh-sdk";
import { defineTool } from "../../core/define-tool";
import { VmSpec, freestyle } from "freestyle-sandboxes";
import { VmDeno } from "@freestyle-sh/with-deno";
import { VmBun } from "@freestyle-sh/with-bun";
import { VmNodeJs } from "@freestyle-sh/with-nodejs";
import { DockerSandboxRunner } from "mesh-plugin-user-sandbox/runner";
import type { MeshContext } from "../../core/mesh-context";
import { requireVmEntry, resolveRuntimeConfig } from "./helpers";
import { buildCloneInfo } from "../../shared/github-clone-info";
import { buildDaemonScript } from "./daemon";
import { generateBranchName } from "../../shared/branch-name";
import { getSharedRunner } from "../../sandbox/lifecycle";
import { removeVmMapEntry, setVmMapEntry } from "./vm-map";

const PROXY_PORT = 9000;

const BOOTSTRAP_SCRIPT = `<script>(function(){window.addEventListener("message",function(e){if(e.data&&e.data.type==="visual-editor::activate"&&e.data.script){try{new Function(e.data.script)()}catch(err){console.error("[visual-editor] injection failed",err)}}});})();</script>`;

/**
 * Compose the pod-public sandbox URL for a given handle. Reads
 * `SANDBOX_ROOT_URL` at call time so deploys can rewrite it without a build.
 * Default: `http://<handle>.sandboxes.localhost:<SANDBOX_INGRESS_PORT|7070>/`.
 */
function composeSandboxUrl(handle: string): string {
  const root = process.env.SANDBOX_ROOT_URL;
  if (root) {
    const base = root.replace(/\/+$/, "");
    if (base.includes("{handle}"))
      return `${base.replace("{handle}", handle)}/`;
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
  return "freestyle";
}

type GithubRepoMeta = {
  githubRepo?: {
    owner: string;
    name: string;
    connectionId?: string;
  } | null;
};

export const VM_START = defineTool({
  name: "VM_START",
  description: "Start a sandbox with the connected GitHub repo and dev server.",
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
    branch: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Optional git branch to check out. When omitted the handler generates `deco/<adjective>-<noun>` and uses it. The resolved branch is returned in the response so callers can persist it.",
      ),
  }),
  outputSchema: z.object({
    previewUrl: z.string(),
    vmId: z.string(),
    branch: z.string(),
    isNewVm: z.boolean(),
    runnerKind: z.enum(["docker", "freestyle"]),
  }),

  handler: async (input, ctx) => {
    try {
      const resolvedBranch = input.branch ?? generateBranchName();

      const {
        metadata,
        userId,
        entry: existing,
      } = await requireVmEntry(
        { virtualMcpId: input.virtualMcpId, branch: resolvedBranch },
        ctx,
      );

      const githubRepo = (metadata as GithubRepoMeta).githubRepo;
      if (!githubRepo) {
        throw new Error("No GitHub repo connected");
      }
      if (!githubRepo.connectionId) {
        throw new Error("GitHub connection id missing on virtual MCP metadata");
      }

      const runnerKind = resolveRunnerKind();
      const { entry, isNewVm } =
        runnerKind === "docker"
          ? await startDocker({
              ctx,
              userId,
              virtualMcpId: input.virtualMcpId,
              branch: resolvedBranch,
              metadata,
              githubRepo,
              existing,
            })
          : await startFreestyle({
              ctx,
              userId,
              virtualMcpId: input.virtualMcpId,
              branch: resolvedBranch,
              metadata,
              githubRepo,
              existing,
            });

      return {
        ...entry,
        branch: resolvedBranch,
        isNewVm,
        runnerKind,
      };
    } catch (e) {
      console.error("[VM_START] error", e);
      throw e;
    }
  },
});

type StartParams = {
  ctx: MeshContext;
  userId: string;
  virtualMcpId: string;
  branch: string;
  metadata: Record<string, unknown>;
  githubRepo: { owner: string; name: string; connectionId?: string };
  existing: VmMapEntry | null;
};

async function startFreestyle(
  params: StartParams,
): Promise<{ entry: VmMapEntry; isNewVm: boolean }> {
  const { ctx, userId, virtualMcpId, branch, metadata, githubRepo, existing } =
    params;
  const { owner, name, connectionId } = githubRepo;

  const { packageManager, runtime, port, runtimeBinPath } =
    resolveRuntimeConfig(metadata);
  const pathPrefix = runtimeBinPath
    ? `export PATH=${runtimeBinPath}:$PATH && `
    : "";

  const { cloneUrl, gitUserName, gitUserEmail } = await buildCloneInfo(
    connectionId!,
    owner,
    name,
    ctx.db,
    ctx.vault,
  );

  const domainKey = createHash("md5")
    .update(`${virtualMcpId}:${userId}:${branch}`)
    .digest("hex")
    .slice(0, 16);
  const previewDomain = `${domainKey}.deco.studio`;
  const previewUrl = `https://${previewDomain}`;

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
          branch,
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

  // Resume existing VM if the (user, branch) pair has one. On stale entry
  // (Freestyle VM missing), clear the vmMap entry and fall through to create.
  if (existing) {
    try {
      const vm = freestyle.vms.ref({ vmId: existing.vmId, spec });
      await vm.start();
      return { entry: existing, isNewVm: false };
    } catch {
      await removeVmMapEntry(
        ctx.storage.virtualMcps,
        virtualMcpId,
        userId,
        userId,
        branch,
      );
    }
  }

  const createResult = await freestyle.vms.create({
    spec,
    domains: [{ domain: previewDomain, vmPort: PROXY_PORT }],
    recreate: true,
    idleTimeoutSeconds: 1800,
  });

  const entry: VmMapEntry = {
    vmId: createResult.vmId,
    previewUrl,
    runnerKind: "freestyle",
  };

  await setVmMapEntry(
    ctx.storage.virtualMcps,
    virtualMcpId,
    userId,
    userId,
    branch,
    entry,
  );

  return { entry, isNewVm: true };
}

async function startDocker(
  params: StartParams,
): Promise<{ entry: VmMapEntry; isNewVm: boolean }> {
  const { ctx, userId, virtualMcpId, branch, metadata, githubRepo, existing } =
    params;
  const { runtime } = resolveRuntimeConfig(metadata);
  const { cloneUrl, gitUserName, gitUserEmail } = await buildCloneInfo(
    githubRepo.connectionId!,
    githubRepo.owner,
    githubRepo.name,
    ctx.db,
    ctx.vault,
  );

  // Key the docker container on (userId, virtualMcpId:branch) so each
  // (user, branch) pair gets its own container. The runner's internal state
  // store uses this projectRef for restart recovery.
  const projectRef = `${virtualMcpId}:${branch}`;
  const runner = getSharedRunner(ctx);
  const sandbox = await runner.ensure(
    { userId, projectRef },
    {
      repo: {
        cloneUrl,
        userName: gitUserName,
        userEmail: gitUserEmail,
        branch,
      },
    },
  );

  // Kick off the dev server asynchronously — idempotent. Skipped for
  // repo-less spins in principle; here we always have a repo since we
  // short-circuited earlier when `githubRepo` was missing.
  if (runner instanceof DockerSandboxRunner) {
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

  const previewUrl = composeSandboxUrl(sandbox.handle);
  const entry: VmMapEntry = {
    vmId: sandbox.handle,
    previewUrl,
    runnerKind: "docker",
  };

  await setVmMapEntry(
    ctx.storage.virtualMcps,
    virtualMcpId,
    userId,
    userId,
    branch,
    entry,
  );

  // If `ensure()` returned the same handle we already had in vmMap, treat as
  // a resume. Otherwise it provisioned a new container (stale entry, orphan
  // recovery, etc.).
  const isNewVm = !existing || existing.vmId !== sandbox.handle;
  return { entry, isNewVm };
}

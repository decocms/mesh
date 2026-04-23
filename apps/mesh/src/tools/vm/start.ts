/**
 * VM_START. Keyed by (userId, branch) in the Virtual MCP's `vmMap`.
 * Runner-agnostic — dispatches through the active `SandboxRunner`; this
 * handler only does `vmMap` bookkeeping. Branch defaults to
 * `deco/<adjective>-<noun>` when omitted.
 */

import { z } from "zod";
import type { VmMapEntry } from "@decocms/mesh-sdk";
import {
  composeSandboxRef,
  resolveRunnerKindFromEnv,
  type Workload,
} from "mesh-plugin-user-sandbox/runner";
import { defineTool } from "../../core/define-tool";
import type { MeshContext } from "../../core/mesh-context";
import { requireVmEntry, resolveRuntimeConfig } from "./helpers";
import { buildCloneInfo } from "../../shared/github-clone-info";
import { generateBranchName } from "../../shared/branch-name";
import { getSharedRunner } from "../../sandbox/lifecycle";
import { setVmMapEntry } from "./vm-map";

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
    previewUrl: z.string().nullable(),
    vmId: z.string(),
    branch: z.string(),
    isNewVm: z.boolean(),
    runnerKind: z.enum(["docker", "freestyle"]),
  }),

  handler: async (input, ctx) => {
    const resolvedBranch = input.branch ?? generateBranchName();

    const {
      metadata,
      userId,
      organization,
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

    const runnerKind = resolveRunnerKindFromEnv();
    const { entry, isNewVm } = await provisionSandbox({
      ctx,
      userId,
      orgId: organization.id,
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
  },
});

type StartParams = {
  ctx: MeshContext;
  userId: string;
  orgId: string;
  virtualMcpId: string;
  branch: string;
  metadata: Record<string, unknown>;
  githubRepo: { owner: string; name: string; connectionId?: string };
  existing: VmMapEntry | null;
};

async function provisionSandbox(
  params: StartParams,
): Promise<{ entry: VmMapEntry; isNewVm: boolean }> {
  const {
    ctx,
    userId,
    orgId,
    virtualMcpId,
    branch,
    metadata,
    githubRepo,
    existing,
  } = params;

  const { runtime, packageManager, port } = resolveRuntimeConfig(metadata);
  const { cloneUrl, gitUserName, gitUserEmail } = await buildCloneInfo(
    githubRepo.connectionId!,
    githubRepo.owner,
    githubRepo.name,
    ctx.db,
    ctx.vault,
  );

  // Missing workload = clone-only. Freestyle treats it as "node, no install,
  // no dev server"; Docker lets the runner pick its default.
  const workload: Workload | undefined =
    runtime && packageManager
      ? {
          runtime,
          packageManager,
          devPort: Number(port),
        }
      : undefined;

  const projectRef = composeSandboxRef({
    orgId,
    virtualMcpId,
    branch,
  });
  const runner = await getSharedRunner(ctx);
  const sandbox = await runner.ensure(
    { userId, projectRef },
    {
      repo: {
        cloneUrl,
        userName: gitUserName,
        userEmail: gitUserEmail,
        branch,
        displayName: `${githubRepo.owner}/${githubRepo.name}`,
      },
      workload,
    },
  );

  // Preserve `createdAt` across resumes so the booting overlay's elapsed
  // timer doesn't reset on re-run.
  const isResume = !!existing && existing.vmId === sandbox.handle;
  const createdAt =
    isResume && existing?.createdAt ? existing.createdAt : Date.now();

  const entry: VmMapEntry = {
    vmId: sandbox.handle,
    previewUrl: sandbox.previewUrl,
    runnerKind: runner.kind,
    createdAt,
  };

  await setVmMapEntry(
    ctx.storage.virtualMcps,
    virtualMcpId,
    userId,
    userId,
    branch,
    entry,
  );

  // Different handle = new sandbox (stale entry / orphan recovery / state miss).
  const isNewVm = !existing || existing.vmId !== sandbox.handle;
  return { entry, isNewVm };
}

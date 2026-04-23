/**
 * VM_START Tool
 *
 * Starts a sandbox with the connected GitHub repo, keyed by (userId, branch)
 * in the Virtual MCP's `vmMap`. App-only tool — not visible to AI models.
 *
 * Runner-agnostic: dispatches through the active `SandboxRunner` (selected
 * by `MESH_SANDBOX_RUNNER`). The runner owns image/spec selection, repo
 * clone, dev-server lifecycle, and preview-URL composition; this handler
 * stays small and deals only with `vmMap` bookkeeping.
 *
 * Branch semantics: the tool accepts an optional `branch`. When omitted it
 * generates `deco/<adjective>-<noun>`. The resolved branch is returned so
 * the client can persist it.
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
    try {
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
    } catch (e) {
      console.error("[VM_START] error", e);
      throw e;
    }
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

  // Workload metadata is optional — when no package manager is selected
  // (clone-only repo) we let the runner pick its default and skip dev-server
  // start. Runners that need it for spec construction (Freestyle) treat the
  // missing case as "node, no install, no dev server".
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

  // VM_START always provisions a dev-server workload, so previewUrl is
  // non-null in practice. The vmMap schema allows null for the future
  // LLM-tool / blank sandbox case where no dev server runs.
  // Preserve `createdAt` across resumes (same handle as the existing entry)
  // so the booting overlay's elapsed timer doesn't reset just because we
  // re-ran VM_START. Only stamp a fresh `createdAt` when this is genuinely
  // a new sandbox handle.
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

  // Resume vs create: same handle as the previously-stored entry means the
  // runner found and reused an existing sandbox; a different handle means it
  // created a new one (stale entry / orphan recovery / state-store miss).
  const isNewVm = !existing || existing.vmId !== sandbox.handle;
  return { entry, isNewVm };
}

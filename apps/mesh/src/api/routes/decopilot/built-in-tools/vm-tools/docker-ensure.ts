/**
 * Memoised Docker handle resolver — provisions the sandbox on first call and
 * hands back the cached handle for the rest of the conversation turn.
 *
 * Single entry point for every Docker vm-tool (read/write/edit/grep/glob/bash);
 * lifts the repo/env/prep-image resolution that previously lived inline in
 * sandbox-bash so the new tool surface stays identical to Freestyle's while
 * still lazy-provisioning on demand.
 */

import type { MeshContext } from "@/core/mesh-context";
import { resolvePrepImage } from "@/sandbox/prep-enqueue";
import { getSharedRunner } from "@/sandbox/shared-runner";
import { buildCloneInfo } from "@/shared/github-clone-info";
import {
  DockerSandboxRunner,
  type EnsureOptions,
  ensureSandbox,
} from "mesh-plugin-user-sandbox/runner";

export interface SandboxRepoRef {
  connectionId: string;
  owner: string;
  name: string;
}

export interface DockerEnsureParams {
  /**
   * Thread's `sandbox_ref` — serves as the runner projectRef so one container
   * backs both the LLM file tools and the preview iframe.
   */
  readonly sandboxRef: string;
  /**
   * GitHub repo attached to the Virtual MCP. When set, cloned on first
   * provision. Null/undefined → blank sandbox.
   */
  readonly repo?: SandboxRepoRef | null;
}

export interface DockerEnsureResult {
  readonly runner: DockerSandboxRunner;
  readonly ensureHandle: () => Promise<string>;
}

/**
 * Build a memoised resolver for the thread's Docker sandbox. Returns null when
 * the shared runner isn't Docker (caller should skip Docker tool registration
 * and let Freestyle / fallback handle it).
 *
 * The returned `ensureHandle` is safe to call from every tool's execute — the
 * underlying `runner.ensure()` path is already idempotent (in-flight map +
 * state-store lookup), and we cache the resolved handle locally to skip
 * redundant state-store probes on chatty turns.
 */
export function createDockerHandleResolver(
  ctx: MeshContext,
  params: DockerEnsureParams,
): DockerEnsureResult | null {
  const runner = getSharedRunner(ctx);
  if (!(runner instanceof DockerSandboxRunner)) return null;

  const { sandboxRef, repo } = params;

  let resolvedRepo: EnsureOptions["repo"] | null | undefined;
  const resolveRepo = async (): Promise<EnsureOptions["repo"] | null> => {
    if (resolvedRepo !== undefined) return resolvedRepo;
    if (!repo) {
      resolvedRepo = null;
      return null;
    }
    const info = await buildCloneInfo(
      repo.connectionId,
      repo.owner,
      repo.name,
      ctx.db,
      ctx.vault,
    );
    resolvedRepo = {
      cloneUrl: info.cloneUrl,
      userName: info.gitUserName,
      userEmail: info.gitUserEmail,
    };
    return resolvedRepo;
  };

  let inflight: Promise<string> | null = null;
  let cached: string | null = null;
  let warmedDevServer = false;

  const ensureHandle = async (): Promise<string> => {
    if (cached) return cached;
    if (inflight) return inflight;
    inflight = (async () => {
      const resolved = await resolveRepo();
      const userEnv = await ctx.storage.sandboxEnv.resolve(sandboxRef);
      // Baked prep image — first thread for a repo still pays clone+install,
      // later threads spawn straight from the prepped image.
      const prepImage =
        repo && ctx.auth.user?.id
          ? await resolvePrepImage(ctx, ctx.auth.user.id, repo)
          : null;
      const sandbox = await ensureSandbox(ctx, runner, {
        sandboxRef,
        repo: resolved ?? undefined,
        env: { ...userEnv },
        image: prepImage ?? undefined,
      });
      // Warm the dev server once per turn when a repo is attached so the
      // preview is ready when the user opens it. Fire-and-forget — the
      // daemon's /dev/start is idempotent and the UI re-polls /dev/status.
      if (resolved && !warmedDevServer) {
        warmedDevServer = true;
        runner
          .proxyDaemonRequest(sandbox.handle, "/_daemon/dev/start", {
            method: "POST",
            headers: new Headers({ "content-type": "application/json" }),
            body: JSON.stringify({}),
          })
          .catch(() => {});
      }
      cached = sandbox.handle;
      return cached;
    })();
    try {
      return await inflight;
    } finally {
      inflight = null;
    }
  };

  return { runner, ensureHandle };
}

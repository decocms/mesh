import { tool, zodSchema } from "ai";
import {
  DockerSandboxRunner,
  type EnsureOptions,
  ensureSandbox,
} from "mesh-plugin-user-sandbox/runner";
import { CLAUDE_IMAGE } from "mesh-plugin-user-sandbox/shared";
import { ensureThreadWorkspace } from "mesh-plugin-user-sandbox/worktree";
import { z } from "zod";
import type { MeshContext } from "@/core/mesh-context";
import { buildCloneInfo } from "@/shared/github-clone-info";
import { getSharedRunner } from "@/sandbox/shared-runner";
import { resolvePrepImage } from "@/sandbox/prep-enqueue";
import {
  MAX_RESULT_TOKENS,
  createOutputPreview,
  estimateJsonTokens,
} from "./read-tool-output";

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 10 * 60_000;

export interface SandboxRepoRef {
  connectionId: string;
  owner: string;
  name: string;
}

export interface SandboxBashToolParams {
  needsApproval: boolean;
  toolOutputMap: Map<string, string>;
  /**
   * GitHub repo attached to the Virtual MCP, if any. Cloned into the sandbox
   * on first provisioning. When null/undefined, the sandbox is blank.
   */
  repo?: SandboxRepoRef | null;
  /**
   * Identifier for the shared sandbox this thread uses. Must be the
   * thread's `sandbox_ref`. Null means the thread has no sandbox provisioned
   * yet — in that case the tool refuses to run and asks the user to re-create
   * the thread.
   */
  sandboxRef: string | null;
}

const bashSchema = z.object({
  command: z.string().describe("The bash command to execute"),
  timeoutMs: z
    .number()
    .optional()
    .describe(
      `Timeout in milliseconds (default ${DEFAULT_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS})`,
    ),
});

function maybeTruncate(
  result: unknown,
  toolOutputMap: Map<string, string>,
): unknown {
  let serialized: string;
  try {
    serialized =
      typeof result === "string" ? result : JSON.stringify(result, null, 2);
  } catch {
    serialized = String(result);
  }
  const tokenCount = estimateJsonTokens(serialized);
  if (tokenCount > MAX_RESULT_TOKENS) {
    const toolCallId = `sandbox_bash_${Date.now()}`;
    toolOutputMap.set(toolCallId, serialized);
    return {
      truncated: true,
      message: `Output too large (${tokenCount} tokens). Use read_tool_output with tool_call_id "${toolCallId}" to extract specific data.`,
      preview: createOutputPreview(serialized),
    };
  }
  return result;
}

/**
 * Built-in `bash` tool backed by a pluggable sandbox runner (docker | freestyle).
 *
 * The sandbox is provisioned lazily on first call, scoped to (userId, threadId),
 * and reused for subsequent calls in the same thread. Runner selection is driven
 * by MESH_SANDBOX_RUNNER.
 */
export function createSandboxBashTool(
  params: SandboxBashToolParams,
  ctx: MeshContext,
) {
  const { needsApproval, toolOutputMap, repo, sandboxRef } = params;

  // Resolve GitHub clone info at most once per tool instance (per stream turn).
  // Only runs when the repo is actually referenced — blank sandboxes pay
  // nothing.
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

  return tool({
    needsApproval,
    description:
      "Execute a shell command in an isolated sandbox scoped to this thread. " +
      "The sandbox is provisioned on first call (no setup required) and preserved for the rest of the thread. " +
      `Timeout default ${DEFAULT_TIMEOUT_MS / 1000}s, max ${MAX_TIMEOUT_MS / 1000}s.`,
    inputSchema: zodSchema(bashSchema),
    execute: async (input: z.infer<typeof bashSchema>) => {
      const timeoutMs = Math.min(
        input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        MAX_TIMEOUT_MS,
      );

      if (!sandboxRef) {
        throw new Error(
          "thread missing sandbox_ref — re-create the thread to provision a sandbox",
        );
      }

      const runner = getSharedRunner(ctx);
      const resolved = await resolveRepo();
      const userEnv = await ctx.storage.sandboxEnv.resolve(sandboxRef);
      // Look up a baked prep image — if present and ready, the new container
      // spawns from it and skips clone + install. First thread for a repo
      // still pays the slow path (bake hasn't finished yet); later threads
      // benefit.
      const prepImage =
        repo && ctx.auth.user?.id
          ? await resolvePrepImage(ctx, ctx.auth.user.id, repo)
          : null;
      // Image fallback chain on fresh provision:
      //   prep image → CLAUDE_IMAGE (when claude-in-sandbox is on) → runner default.
      // Without the CLAUDE_IMAGE step, this path provisions a `mesh-sandbox:local`
      // container; if claude-code attaches to it later (same sandbox_ref), the
      // daemon eats ~18s of lazy install. Mirrors stream-core's claude branch
      // so the *first* path to provision wins with the right image.
      const claudeFallback =
        process.env.MESH_CLAUDE_CODE_IN_SANDBOX === "1"
          ? CLAUDE_IMAGE
          : undefined;
      const sandbox = await ensureSandbox(ctx, runner, {
        sandboxRef,
        repo: resolved ?? undefined,
        env: { ...userEnv },
        image: prepImage ?? claudeFallback,
      });
      // When the sandbox is shared across threads (agent-scoped sandbox_ref),
      // each thread gets its own git worktree under /app/workspaces/.
      // For per-thread sandbox_refs the helper still runs but typically
      // returns /app (no isolation needed when nothing else shares the
      // container). Skipped when no threadId is in scope (callers from
      // outside a decopilot turn).
      const threadId = ctx.metadata?.threadId;
      const cwd = threadId
        ? (await ensureThreadWorkspace(runner, sandbox.handle, threadId)).cwd
        : undefined;
      // Warm up the dev server in the background when a repo is attached, so
      // the preview is ready by the time the user opens it. Fire-and-forget —
      // `ensureSandbox` has already waited for the clone, and `/dev/start` is
      // idempotent on subsequent calls.
      //
      // When per-thread dev is on, the warm-up targets this thread's worktree
      // (`cwd`) and keys the daemon's dev state by threadId so siblings don't
      // share one dev process. Without the flag, the daemon falls back to the
      // default thread as before.
      if (resolved && runner instanceof DockerSandboxRunner) {
        const perThread = process.env.MESH_SANDBOX_PER_THREAD_DEV === "1";
        const devBody: Record<string, unknown> = {};
        if (perThread && threadId) {
          devBody.threadId = threadId;
          if (cwd) devBody.cwd = cwd;
        }
        runner
          .proxyDaemonRequest(sandbox.handle, "/dev/start", {
            method: "POST",
            headers: new Headers({ "content-type": "application/json" }),
            body: JSON.stringify(devBody),
          })
          .catch(() => {});
      }
      const result = await runner.exec(sandbox.handle, {
        command: input.command,
        timeoutMs,
        cwd,
      });
      return maybeTruncate(result, toolOutputMap);
    },
  });
}

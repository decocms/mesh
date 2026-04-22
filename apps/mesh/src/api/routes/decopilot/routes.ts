/**
 * Decopilot Routes
 *
 * HTTP handlers for the Decopilot AI assistant.
 * Uses Memory and ModelProvider abstractions.
 */

import type { MeshContext } from "@/core/mesh-context";
import {
  consumeStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { DEFAULT_WINDOW_SIZE } from "./constants";
import { splitRequestMessages } from "./conversation";
import {
  ensureOrganization,
  validateThreadAccess,
  validateThreadOwnership,
} from "./helpers";
import type { CancelBroadcast } from "./cancel-broadcast";
import type { StreamBuffer } from "./stream-buffer";
import type { RunRegistry } from "./run-registry";
import {
  checkModelPermission,
  fetchModelPermissions,
  parseModelsToMap,
} from "./model-permissions";
import { PersistedRunConfigSchema, toModelsConfig } from "./run-config";
import type { ThreadSandboxResponse } from "./sandbox-response";
import { StreamRequestSchema } from "./schemas";
import type { ChatMessage, ModelsConfig } from "./types";
import { streamCore } from "./stream-core";
import { RunClaimError } from "./run-reactor";
import type { SqlThreadStorage } from "@/storage/threads";
import { getPodId } from "@/core/pod-identity";
import { getSharedRunner } from "@/sandbox/shared-runner";
import { DockerSandboxRunner } from "mesh-plugin-user-sandbox/runner";
import { composeSandboxUrl } from "@/tools/vm/start";

// ============================================================================
// Request Validation
// ============================================================================

async function validateRequest(
  c: Context<{ Variables: { meshContext: MeshContext } }>,
) {
  const organization = ensureOrganization(c);
  const rawPayload = await c.req.json();

  const parseResult = StreamRequestSchema.safeParse(rawPayload);
  if (!parseResult.success) {
    throw new HTTPException(400, { message: parseResult.error.message });
  }

  const { messages: rawMessages, ...rest } = parseResult.data;
  const msgs = rawMessages as unknown as ChatMessage[];
  const { systemMessages, requestMessage } = splitRequestMessages(msgs);

  return {
    organization,
    systemMessages,
    requestMessage,
    ...rest,
  };
}

// ============================================================================
// Default Model Resolution
// ============================================================================

async function resolveDefaultModels(
  ctx: MeshContext,
  organizationId: string,
): Promise<ModelsConfig> {
  const keys = await ctx.storage.aiProviderKeys.list({ organizationId });
  if (keys.length === 0) {
    throw new HTTPException(400, {
      message: "No AI provider credentials configured for this organization",
    });
  }
  const credential = keys[0]!;
  const modelList = await ctx.aiProviders.listModels(
    credential.id,
    organizationId,
  );
  if (modelList.length === 0) {
    throw new HTTPException(400, {
      message: "No models available from the configured AI provider",
    });
  }
  const model = modelList[0]!;
  return {
    credentialId: credential.id,
    thinking: { id: model.modelId, title: model.title },
  };
}

// ============================================================================
// Route Handler
// ============================================================================

export interface DecopilotDeps {
  cancelBroadcast: CancelBroadcast;
  streamBuffer: StreamBuffer;
  runRegistry: RunRegistry;
  threadStorage: SqlThreadStorage;
}

export function createDecopilotRoutes(deps: DecopilotDeps) {
  const { cancelBroadcast, streamBuffer, runRegistry, threadStorage } = deps;
  const app = new Hono<{ Variables: { meshContext: MeshContext } }>();

  // ============================================================================
  // Allowed Models Endpoint
  // ============================================================================

  app.get("/:org/decopilot/allowed-models", async (c) => {
    try {
      const ctx = c.get("meshContext");
      const organization = ensureOrganization(c);
      const role = ctx.auth.user?.role;

      const models = await fetchModelPermissions(ctx.db, organization.id, role);

      return c.json(parseModelsToMap(models));
    } catch (err) {
      console.error("[decopilot:allowed-models] Error", err);
      if (err instanceof HTTPException) {
        return c.json({ error: err.message }, err.status);
      }
      return c.json(
        { error: err instanceof Error ? err.message : "Internal error" },
        500,
      );
    }
  });

  // ============================================================================
  // Stream Endpoint
  // ============================================================================

  app.post("/:org/decopilot/stream", async (c) => {
    try {
      const ctx = c.get("meshContext");

      // 1. Validate request
      const {
        organization,
        models: clientModels,
        agent,
        systemMessages,
        requestMessage,
        temperature,
        memory: memoryConfig,
        thread_id,
        toolApprovalLevel,
        mode,
      } = await validateRequest(c);

      const userId = ctx.auth?.user?.id;
      if (!userId) {
        throw new HTTPException(401, { message: "User ID is required" });
      }

      // 2. Resolve models — use client-provided or fall back to org defaults
      const models =
        clientModels ?? (await resolveDefaultModels(ctx, organization.id));

      // 3. Check model permissions
      const allowedModels = await fetchModelPermissions(
        ctx.db,
        organization.id,
        ctx.auth.user?.role,
      );

      if (
        allowedModels !== undefined &&
        !checkModelPermission(
          allowedModels,
          models.credentialId,
          models.thinking.id,
        )
      ) {
        throw new HTTPException(403, {
          message: "Model not allowed for your role",
        });
      }

      const windowSize = memoryConfig?.windowSize ?? DEFAULT_WINDOW_SIZE;
      const resolvedThreadId = thread_id ?? memoryConfig?.thread_id;

      // 4. Delegate to streamCore
      const result = await streamCore(
        {
          messages: [...systemMessages, requestMessage],
          models,
          agent,
          temperature,
          toolApprovalLevel,
          mode,
          organizationId: organization.id,
          userId,
          taskId: resolvedThreadId,
          windowSize,
        },
        ctx,
        { runRegistry, streamBuffer, cancelBroadcast },
      );

      return createUIMessageStreamResponse({
        stream: result.stream,
        consumeSseStream: consumeStream,
      });
    } catch (err) {
      console.error("[decopilot:stream] Error", err);

      if (err instanceof HTTPException) {
        return c.json({ error: err.message }, err.status);
      }

      if (err instanceof Error && err.name === "AbortError") {
        console.warn("[decopilot:stream] Aborted", { error: err.message });
        return c.json({ error: "Request aborted" }, 400);
      }

      console.error("[decopilot:stream] Failed", {
        error: err instanceof Error ? err.message : JSON.stringify(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      return c.json(
        { error: err instanceof Error ? err.message : JSON.stringify(err) },
        500,
      );
    }
  });

  app.post("/:org/decopilot/runtime/stream", async (c) => {
    try {
      const ctx = c.get("meshContext");

      // 1. Validate request
      const {
        organization,
        models: clientModels,
        agent,
        systemMessages,
        requestMessage,
        temperature,
        memory: memoryConfig,
        thread_id,
        toolApprovalLevel,
        mode,
      } = await validateRequest(c);

      const userId = ctx.auth?.user?.id;
      if (!userId) {
        throw new HTTPException(401, { message: "User ID is required" });
      }

      // 2. Resolve models — use client-provided or fall back to org defaults
      const models =
        clientModels ?? (await resolveDefaultModels(ctx, organization.id));

      // 3. Check model permissions
      const allowedModels = await fetchModelPermissions(
        ctx.db,
        organization.id,
        ctx.auth.user?.role,
      );

      if (
        allowedModels !== undefined &&
        !checkModelPermission(
          allowedModels,
          models.credentialId,
          models.thinking.id,
        )
      ) {
        throw new HTTPException(403, {
          message: "Model not allowed for your role",
        });
      }

      const windowSize = memoryConfig?.windowSize ?? DEFAULT_WINDOW_SIZE;
      const resolvedThreadId = thread_id ?? memoryConfig?.thread_id;

      // 4. Delegate to streamCore
      const result = await streamCore(
        {
          messages: [...systemMessages, requestMessage],
          models,
          agent,
          temperature,
          toolApprovalLevel,
          mode,
          organizationId: organization.id,
          userId,
          taskId: resolvedThreadId,
          windowSize,
        },
        ctx,
        { runRegistry, streamBuffer, cancelBroadcast },
      );

      return createUIMessageStreamResponse({
        stream: result.stream,
        consumeSseStream: consumeStream,
      });
    } catch (err) {
      console.error("[decopilot:stream] Error", err);

      if (err instanceof RunClaimError) {
        return c.json({ error: err.message }, 409);
      }

      if (err instanceof HTTPException) {
        return c.json({ error: err.message }, err.status);
      }

      if (err instanceof Error && err.name === "AbortError") {
        console.warn("[decopilot:stream] Aborted", { error: err.message });
        return c.json({ error: "Request aborted" }, 400);
      }

      console.error("[decopilot:stream] Failed", {
        error: err instanceof Error ? err.message : JSON.stringify(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      return c.json(
        { error: err instanceof Error ? err.message : JSON.stringify(err) },
        500,
      );
    }
  });

  // ============================================================================
  // Cancel Endpoint — cancel ongoing run (local or via NATS to owning pod)
  // ============================================================================

  app.post("/:org/decopilot/cancel/:threadId", async (c) => {
    const { taskId, thread, organization } = await validateThreadOwnership(c);

    // Try to cancel locally first
    const cancelTransitions = await runRegistry.execute({
      type: "CANCEL",
      taskId,
    });
    if (cancelTransitions.some((t) => t.event.type === "RUN_FAILED")) {
      return c.json({ cancelled: true });
    }

    // Not on this pod — broadcast to all pods
    cancelBroadcast.broadcast(taskId);

    // Ghost run: server restarted while a run was in progress. No pod has this
    // run in memory, so the broadcast will never resolve. Force-fail the thread
    // in the DB so the user can send new messages.
    if (thread.status === "in_progress") {
      console.warn("[decopilot:cancel] Ghost run detected, force-failing", {
        taskId,
      });
      runRegistry
        .execute({
          type: "FORCE_FAIL",
          taskId,
          reason: "ghost",
          orgId: organization.id,
        })
        .catch((err) => {
          console.error(
            "[decopilot:cancel] Failed to force-fail ghost thread",
            {
              taskId,
              err,
            },
          );
        });
    }

    return c.json({ cancelled: true, async: true }, 202);
  });

  // ============================================================================
  // Thread Sandbox Endpoint — discriminated-union describing the live sandbox
  //
  // Returns `{ sandbox, thread }`. `sandbox` is a tagged union (docker |
  // freestyle) so the frontend can exhaustively switch on `kind`; a dead
  // Docker handle can never be served as a Freestyle preview URL, and a
  // stale `activeVms` entry can never back-fill the Docker path.
  //
  // Runner kind is a process-global (MESH_SANDBOX_RUNNER) — we dispatch on
  // it here so the client doesn't need to know which runner the server was
  // booted with.
  // ============================================================================

  app.get("/:org/decopilot/threads/:threadId/sandbox", async (c) => {
    const ctx = c.get("meshContext");
    const userId = ctx.auth?.user?.id;
    if (!userId) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }
    ensureOrganization(c);
    const taskId = c.req.param("threadId");
    if (!taskId || /[.*>\s]/.test(taskId)) {
      throw new HTTPException(400, { message: "Invalid thread ID" });
    }

    const thread = await ctx.storage.threads.get(taskId);
    if (!thread) {
      const body: ThreadSandboxResponse = {
        sandbox: null,
        thread: { exists: false, sandboxRef: null },
      };
      return c.json(body);
    }

    const sandboxRef = thread.sandbox_ref;
    const threadShape = { exists: true, sandboxRef };

    const runnerKind =
      process.env.MESH_SANDBOX_RUNNER === "docker" ? "docker" : "freestyle";

    if (runnerKind === "docker") {
      if (!sandboxRef) {
        const body: ThreadSandboxResponse = {
          sandbox: null,
          thread: threadShape,
        };
        return c.json(body);
      }
      const row = await ctx.db
        .selectFrom("sandbox_runner_state")
        .select(["handle"])
        .where("user_id", "=", userId)
        .where("project_ref", "=", sandboxRef)
        .where("runner_kind", "=", "docker")
        .executeTakeFirst();
      if (!row) {
        const body: ThreadSandboxResponse = {
          sandbox: null,
          thread: threadShape,
        };
        return c.json(body);
      }

      // Ask the sandbox daemon whether the dev server is actually bound. The
      // daemon discovers the port itself so we don't need to thread it through
      // runtime metadata — any framework's default port works.
      //
      // If the dev process has exited/crashed, fire-and-forget `/dev/start` so
      // the server self-heals on page view. The `/dev/start` call is idempotent
      // when phase is already starting/installing/ready, so hitting this
      // endpoint on every poll is safe. Phase "idle" happens after a daemon
      // restart (container still alive but never saw a /dev/start yet).
      const runner = getSharedRunner(ctx);
      let phase: string | undefined;
      let serverUp = false;
      let crashBackoffRemainingMs = 0;
      if (runner instanceof DockerSandboxRunner) {
        try {
          const res = await runner.proxyDaemonRequest(
            row.handle,
            "/_daemon/dev/status",
            {
              method: "GET",
              headers: new Headers(),
              body: null,
            },
          );
          if (res.ok) {
            const status = (await res.json()) as {
              phase?: string;
              crashBackoffRemainingMs?: number;
            };
            phase = status.phase;
            serverUp = status.phase === "ready";
            crashBackoffRemainingMs = status.crashBackoffRemainingMs ?? 0;
          }
        } catch {
          serverUp = false;
        }

        // Crash-loop backoff: when the daemon reports it's in backoff after
        // consecutive fast crashes, skip the auto-restart poke. Without this,
        // every preview-panel poll would fire /dev/start on a dev script
        // that can't boot (missing dep, bad config), burning CPU forever.
        // The user's "restart" button sends `restart: true` which bypasses
        // the backoff on the daemon side.
        const inCrashBackoff =
          phase === "crashed" && crashBackoffRemainingMs > 0;
        if (
          !inCrashBackoff &&
          (phase === "idle" || phase === "exited" || phase === "crashed")
        ) {
          // Auto-poll never sends `restart: true` — that flag resets the
          // daemon's crash-loop counter, so polling in a crash scenario would
          // hold the backoff at the shortest window forever. Human-triggered
          // restarts go through a separate UI path that sets restart:true.
          runner
            .proxyDaemonRequest(row.handle, "/_daemon/dev/start", {
              method: "POST",
              headers: new Headers({ "content-type": "application/json" }),
              body: JSON.stringify({ restart: false }),
            })
            .catch(() => {
              // Fire-and-forget — the UI will re-poll /dev/status.
            });
        }
      }

      const previewUrl = composeSandboxUrl(row.handle);

      const body: ThreadSandboxResponse = {
        sandbox: {
          kind: "docker",
          previewUrl,
          handle: row.handle,
          serverUp,
          phase: phase ?? null,
        },
        thread: threadShape,
      };
      return c.json(body);
    }

    // Freestyle: activeVms is still the source of truth. `patchActiveVms` in
    // the VM_START/VM_DELETE tools writes the per-user entry; we project it
    // into the same response shape here so the frontend never reads Virtual
    // MCP metadata directly.
    const virtualMcpId = thread.virtual_mcp_id;
    if (!virtualMcpId) {
      const body: ThreadSandboxResponse = {
        sandbox: null,
        thread: threadShape,
      };
      return c.json(body);
    }
    const virtualMcp = await ctx.storage.virtualMcps.findById(virtualMcpId);
    const activeVms = (
      virtualMcp?.metadata as
        | {
            activeVms?: Record<
              string,
              { previewUrl: string; vmId: string; terminalUrl: string | null }
            >;
          }
        | undefined
    )?.activeVms;
    const entry = activeVms?.[userId];
    if (!entry) {
      const body: ThreadSandboxResponse = {
        sandbox: null,
        thread: threadShape,
      };
      return c.json(body);
    }
    const body: ThreadSandboxResponse = {
      sandbox: {
        kind: "freestyle",
        previewUrl: entry.previewUrl,
        vmId: entry.vmId,
        terminalUrl: entry.terminalUrl,
      },
      thread: threadShape,
    };
    return c.json(body);
  });

  // ============================================================================
  // Attach Endpoint — replay JetStream-buffered stream for late-joining clients
  // ============================================================================

  app.get("/:org/decopilot/attach/:threadId", async (c) => {
    try {
      const { taskId, thread, organization } = await validateThreadAccess(c);

      // ── Fast path: run is active on this pod → replay buffer ──
      if (runRegistry.isRunning(taskId)) {
        const replayChunkStream = await streamBuffer.createReplayStream(taskId);
        if (!replayChunkStream) {
          return c.body(null, 204);
        }

        const replayStream = createUIMessageStream({
          execute: async ({ writer }) => {
            const reader = replayChunkStream.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                writer.write(value);
              }
            } finally {
              reader.releaseLock();
            }
          },
        });

        return createUIMessageStreamResponse({
          stream: replayStream,
          consumeSseStream: consumeStream,
        });
      }

      // ── Orphan resume path ──
      const ctx = c.get("meshContext");
      const userId = ctx.auth?.user?.id;

      // Not in_progress → nothing to resume
      if (thread.status !== "in_progress") {
        return c.body(null, 204);
      }

      // Only the thread owner can trigger orphan resume
      if (thread.created_by !== userId) {
        return c.body(null, 204);
      }

      // No persisted config → can't resume; force-fail so user can retry
      if (!thread.run_config) {
        await threadStorage.forceFailIfInProgress(taskId, organization.id);
        return c.body(null, 204);
      }

      // Validate stored config (schema drift protection)
      const parsed = PersistedRunConfigSchema.safeParse(thread.run_config);
      if (!parsed.success) {
        await threadStorage.forceFailIfInProgress(taskId, organization.id);
        return c.body(null, 204);
      }
      const config = parsed.data;

      // Re-check model permissions with CURRENT user role
      const allowedModels = await fetchModelPermissions(
        ctx.db,
        organization.id,
        ctx.auth.user?.role,
      );
      if (
        allowedModels !== undefined &&
        !checkModelPermission(
          allowedModels,
          config.models.credentialId,
          config.models.thinking.id,
        )
      ) {
        throw new HTTPException(403, {
          message: "Model not allowed for your role",
        });
      }

      // Atomic CAS claim — succeeds for null or stale run_owner_pod
      const claimed = await threadStorage.claimOrphanedRun(
        taskId,
        organization.id,
        getPodId(),
      );
      if (!claimed) {
        return c.body(null, 204);
      }

      // Resume the run — identity from auth context, NOT stored config
      const result = await streamCore(
        {
          messages: [],
          models: toModelsConfig(config.models),
          agent: config.agent,
          temperature: config.temperature,
          toolApprovalLevel: config.toolApprovalLevel,
          mode: config.mode,
          organizationId: organization.id,
          userId,
          taskId,
          windowSize: config.windowSize,
          isResume: true,
        },
        ctx,
        { runRegistry, streamBuffer, cancelBroadcast },
      );

      return createUIMessageStreamResponse({
        stream: result.stream,
        consumeSseStream: consumeStream,
      });
    } catch (err) {
      if (err instanceof HTTPException) throw err;
      console.error("[decopilot:attach] Error", err);
      return c.body(null, 500);
    }
  });

  return app;
}

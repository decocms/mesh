/**
 * Decopilot Routes
 *
 * HTTP handlers for the Decopilot AI assistant.
 * Uses Memory and ModelProvider abstractions.
 */

import { consumeStream, stepCountIs, streamText } from "ai";
import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import type { MeshContext } from "@/core/mesh-context";
import { clientFromConnection, withStreamingSupport } from "@/mcp-clients";
import { createVirtualClientFrom } from "@/mcp-clients/virtual-mcp";
import { addUsage, emptyUsageStats, type UsageStats } from "@decocms/mesh-sdk";
import { getBuiltInTools } from "./built-in-tools";
import {
  DECOPILOT_BASE_PROMPT,
  DEFAULT_MAX_TOKENS,
  DEFAULT_THREAD_TITLE,
  DEFAULT_WINDOW_SIZE,
  generateMessageId,
} from "./constants";
import { processConversation, splitRequestMessages } from "./conversation";
import { ensureOrganization, toolsFromMCP } from "./helpers";
import { createMemory, Memory } from "./memory";
import { resolveThreadStatus } from "./status";
import { ensureModelCompatibility } from "./model-compat";
import {
  checkModelPermission,
  fetchModelPermissions,
  parseModelsToMap,
} from "./model-permissions";
import { createModelProviderFromClient } from "./model-provider";
import { StreamRequestSchema } from "./schemas";
import { generateTitleInBackground } from "./title-generator";
import type { ChatMessage } from "./types";

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
// Route Handler
// ============================================================================

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
  let memory: Memory | undefined;
  try {
    const ctx = c.get("meshContext");

    // 1. Validate request
    const {
      organization,
      models,
      agent,
      systemMessages,
      requestMessage,
      temperature,
      memory: memoryConfig,
      thread_id,
    } = await validateRequest(c);

    const userId = ctx.auth?.user?.id;
    if (!userId) {
      throw new HTTPException(401, { message: "User ID is required" });
    }

    // 2. Check model permissions
    const allowedModels = await fetchModelPermissions(
      ctx.db,
      organization.id,
      ctx.auth.user?.role,
    );

    if (
      !checkModelPermission(
        allowedModels,
        models.connectionId,
        models.thinking.id,
      )
    ) {
      throw new HTTPException(403, {
        message: "Model not allowed for your role",
      });
    }

    const windowSize = memoryConfig?.windowSize ?? DEFAULT_WINDOW_SIZE;
    const threadId = thread_id ?? memoryConfig?.threadId;

    // Get connection entities and create/load memory in parallel
    const [virtualMcp, modelConnection, mem] = await Promise.all([
      ctx.storage.virtualMcps.findById(agent.id, organization.id),
      ctx.storage.connections.findById(models.connectionId, organization.id),
      createMemory(ctx.storage.threads, {
        organizationId: organization.id,
        threadId,
        userId,
        defaultWindowSize: windowSize,
      }),
    ]);
    memory = mem;

    if (!modelConnection) {
      throw new Error("Model connection not found");
    }

    if (!virtualMcp) {
      throw new Error("Agent not found");
    }

    // Mark thread as in_progress at the start of streaming
    await ctx.storage.threads.update(memory.thread.id, {
      status: "in_progress",
    });

    // Create model client for LLM calls
    const modelClient = await clientFromConnection(modelConnection, ctx, false);

    const mcpClient = await createVirtualClientFrom(
      virtualMcp,
      ctx,
      agent.mode,
    );

    // Add streaming support since agents may use streaming models
    const streamableModelClient = withStreamingSupport(
      modelClient,
      models.connectionId,
      modelConnection,
      ctx,
      { superUser: false },
    );

    // Extract tools and create model provider
    const [mcpTools, modelProvider] = await Promise.all([
      toolsFromMCP(mcpClient),
      createModelProviderFromClient(streamableModelClient, models),
    ]);

    // 3. Get built-in tools (client-side tools like user_ask)
    const builtInTools = getBuiltInTools();

    // CRITICAL: Register abort handler to ensure client cleanup on disconnect
    // Without this, when client disconnects mid-stream, onFinish/onError are NOT called
    // and the MCP client + transport streams leak (TextDecoderStream, 256KB buffers)
    const abortSignal = c.req.raw.signal;
    abortSignal.addEventListener("abort", () => {
      modelClient.close().catch(() => {});
      // Mark thread as failed on client disconnect
      if (memory?.thread?.id) {
        ctx.storage.threads
          .update(memory.thread.id, { status: "failed" })
          .catch(() => {});
      }
    });

    // Get server instructions if available (for virtual MCP agents)
    const serverInstructions = mcpClient.getInstructions();

    // Merge platform instructions with request system messages
    const systemPrompt = DECOPILOT_BASE_PROMPT(serverInstructions);
    const allSystemMessages: ChatMessage[] = [systemPrompt, ...systemMessages];

    // 4. Process conversation
    const {
      systemMessages: processedSystemMessages,
      messages: processedMessages,
      originalMessages,
    } = await processConversation(memory, requestMessage, allSystemMessages, {
      windowSize,
      models,
    });

    ensureModelCompatibility(models, originalMessages);

    const maxOutputTokens =
      models.thinking.limits?.maxOutputTokens ?? DEFAULT_MAX_TOKENS;

    const shouldGenerateTitle = memory.thread.title === DEFAULT_THREAD_TITLE;
    const titlePromise = shouldGenerateTitle
      ? generateTitleInBackground({
          abortSignal,
          model: modelProvider.fastModel ?? modelProvider.thinkingModel,
          userMessage: JSON.stringify(processedMessages[0]?.content),
        })
      : Promise.resolve(null);

    let resolvedTitle: string | null = null;
    let reasoningStartAt: Date | null = null;
    let accumulatedUsage: UsageStats = emptyUsageStats();

    // 5. Main stream
    const result = streamText({
      model: modelProvider.thinkingModel,
      system: processedSystemMessages,
      messages: processedMessages,
      tools: { ...mcpTools, ...builtInTools },
      temperature,
      maxOutputTokens,
      abortSignal,
      stopWhen: stepCountIs(30),
      onStepFinish: async () => {
        resolvedTitle = await titlePromise;

        if (!resolvedTitle) return;

        await ctx.storage.threads
          .update(memory!.thread.id, { title: resolvedTitle })
          .catch((error) => {
            console.error(
              "[decopilot:stream] Error updating thread title",
              error,
            );
          });
      },
      onError: async (error) => {
        console.error("[decopilot:stream] Error", error);
        throw error;
      },
    });

    // 6. Return the stream response with metadata
    return result.toUIMessageStreamResponse({
      originalMessages,
      // consumeSseStream ensures proper abort handling and prevents memory leaks
      consumeSseStream: consumeStream,
      generateMessageId,
      messageMetadata: ({ part }) => {
        if (part.type === "start") {
          return {
            agent: { id: agent.id ?? null, mode: agent.mode },
            models: {
              connectionId: models.connectionId,
              thinking: models.thinking,
            },
            created_at: new Date(),
            thread_id: memory!.thread.id,
          };
        }
        if (part.type === "reasoning-start") {
          if (reasoningStartAt === null) {
            reasoningStartAt = new Date();
          }
          return { reasoning_start_at: reasoningStartAt };
        }
        if (part.type === "reasoning-end") {
          return { reasoning_end_at: new Date() };
        }

        if (part.type === "finish-step") {
          accumulatedUsage = addUsage(accumulatedUsage, {
            ...part.usage,
            providerMetadata: part.providerMetadata,
          });
          const provider = models.thinking.provider;
          return {
            usage: {
              inputTokens: accumulatedUsage.inputTokens,
              outputTokens: accumulatedUsage.outputTokens,
              reasoningTokens: accumulatedUsage.reasoningTokens || undefined,
              totalTokens: accumulatedUsage.totalTokens,
              providerMetadata: provider
                ? {
                    ...part.providerMetadata,
                    [provider]: {
                      ...(part.providerMetadata?.[provider] ?? {}),
                      reasoning_details: undefined,
                    },
                  }
                : part.providerMetadata,
            },
          };
        }

        if (part.type === "finish") {
          return {
            title: resolvedTitle ?? undefined,
          };
        }

        return;
      },
      onFinish: async ({
        messages: _UIMessages,
        isAborted: _isAborted,
        responseMessage,
      }) => {
        const now = Date.now();
        const messagesToSave = [
          ...new Map(
            [requestMessage, responseMessage]
              .filter(Boolean)
              .map((m) => [m.id, m]),
          ).values(),
        ].map((message, i) => ({
          ...message,
          metadata: { ...message.metadata, title: resolvedTitle ?? undefined },
          threadId: memory!.thread.id,
          createdAt: new Date(now + i).toISOString(),
          updatedAt: new Date(now + i).toISOString(),
        }));

        if (messagesToSave.length === 0) return;

        await memory!.save(messagesToSave).catch((error) => {
          console.error("[decopilot:stream] Error saving messages", error);
        });

        // Determine and persist thread status
        const finishReason = await result.finishReason;
        const threadStatus = resolveThreadStatus(
          finishReason,
          responseMessage?.parts as Array<{
            type: string;
            toolName?: string;
            state?: string;
          }>,
        );

        await ctx.storage.threads
          .update(memory!.thread.id, { status: threadStatus })
          .catch((error) => {
            console.error(
              "[decopilot:stream] Error updating thread status",
              error,
            );
          });
      },
    });
  } catch (err) {
    // If we have a thread, mark it as failed
    if (memory) {
      const ctx = c.get("meshContext");
      await ctx.storage.threads
        .update(memory.thread.id, { status: "failed" })
        .catch((statusErr: unknown) => {
          console.error(
            "[decopilot:stream] Failed to update thread status",
            statusErr,
          );
        });
    }

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

export default app;

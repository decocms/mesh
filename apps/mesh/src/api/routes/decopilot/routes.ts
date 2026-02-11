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
import { processConversation } from "./conversation";
import { ensureOrganization, toolsFromMCP } from "./helpers";
import { createMemory } from "./memory";
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

  return {
    organization,
    ...parseResult.data,
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
  try {
    const ctx = c.get("meshContext");

    // 1. Validate request
    const {
      organization,
      models,
      agent,
      messages: incomingMessages,
      temperature,
      memory: memoryConfig,
      thread_id,
    } = await validateRequest(c);
    const messages = incomingMessages as unknown as ChatMessage[];

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

    // Get connection entities
    const [virtualMcp, modelConnection] = await Promise.all([
      ctx.storage.virtualMcps.findById(agent.id, organization.id),
      ctx.storage.connections.findById(models.connectionId, organization.id),
    ]);

    if (!modelConnection) {
      throw new Error("Model connection not found");
    }

    if (!virtualMcp) {
      throw new Error("Agent not found");
    }

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

    // 2. Extract tools from virtual MCP client, create model provider, and create/load memory
    const [mcpTools, modelProvider, memory] = await Promise.all([
      toolsFromMCP(mcpClient),
      createModelProviderFromClient(streamableModelClient, models),
      createMemory(ctx.storage.threads, {
        organizationId: organization.id,
        threadId,
        userId,
        defaultWindowSize: windowSize,
      }),
    ]);

    // 3. Get built-in tools (client-side tools like user_ask)
    const builtInTools = getBuiltInTools();

    // CRITICAL: Register abort handler to ensure client cleanup on disconnect
    // Without this, when client disconnects mid-stream, onFinish/onError are NOT called
    // and the MCP client + transport streams leak (TextDecoderStream, 256KB buffers)
    const abortSignal = c.req.raw.signal;
    abortSignal.addEventListener("abort", () => {
      modelClient.close().catch(() => {});
    });

    // Get server instructions if available (for virtual MCP agents)
    const serverInstructions = mcpClient.getInstructions();

    // Build system prompt combining platform instructions with agent-specific instructions
    const systemPrompt = DECOPILOT_BASE_PROMPT(serverInstructions);

    // 4. Process conversation
    const {
      systemMessages,
      messages: processedMessages,
      originalMessages,
    } = await processConversation(memory, messages, systemPrompt, {
      windowSize,
      models,
    });

    ensureModelCompatibility(models, originalMessages);

    const requestMessage = messages.find((m) => m.role !== "system")!;

    const maxOutputTokens =
      models.thinking.limits?.maxOutputTokens ?? DEFAULT_MAX_TOKENS;
    let newTitle: string | null = null;

    // 5. Main stream
    const result = streamText({
      model: modelProvider.thinkingModel,
      system: systemMessages,
      messages: processedMessages,
      tools: { ...mcpTools, ...builtInTools },
      temperature,
      maxOutputTokens,
      abortSignal,
      stopWhen: stepCountIs(30),
      onStepFinish: async () => {
        const shouldGenerateTitle =
          memory.thread.title === DEFAULT_THREAD_TITLE;
        // Title generation runs after first step's TEXT is already streamed.
        // This blocks the "finish-step" event and subsequent steps (for tool calls),
        // but the response text has already been sent to the client.
        if (shouldGenerateTitle && newTitle === null) {
          const userMessage = JSON.stringify(processedMessages[0]?.content);
          const modelToUse =
            modelProvider.fastModel ?? modelProvider.thinkingModel;

          await generateTitleInBackground({
            abortSignal,
            model: modelToUse,
            userMessage,
            onTitle: (title) => {
              newTitle = title;
              ctx.storage.threads
                .update(memory.thread.id, { title })
                .catch((error) => {
                  console.error(
                    "[decopilot:stream] Error updating thread title",
                    error,
                  );
                });
            },
          }).catch((error) => {
            console.error("[decopilot:stream] Error generating title", error);
          });
        }
      },
      onError: async (error) => {
        console.error("[decopilot:stream] Error", error);
        throw error;
      },
    });

    let reasoningStartAt: Date | null = null;
    let accumulatedUsage: UsageStats = emptyUsageStats();

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
            thread_id: memory.thread.id,
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
            title: newTitle ?? undefined,
          };
        }

        return;
      },
      onFinish: async ({
        messages: _UIMessages,
        isAborted: _isAborted,
        responseMessage,
      }) => {
        const now = new Date().toISOString();
        const messagesToSave = [
          ...new Map(
            [requestMessage, responseMessage]
              .filter(Boolean)
              .map((m) => [m.id, m]),
          ).values(),
        ].map((message) => ({
          ...message,
          metadata: { ...message.metadata, title: newTitle ?? undefined },
          threadId: memory.thread.id,
          createdAt: now,
          updatedAt: now,
        }));

        if (messagesToSave.length === 0) return;

        await memory.save(messagesToSave).catch((error) => {
          console.error("[decopilot:stream] Error saving messages", error);
        });
      },
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

export default app;

/**
 * Decopilot Routes
 *
 * HTTP handlers for the Decopilot AI assistant.
 * Uses Memory and ModelProvider abstractions.
 */

import { consumeStream, stepCountIs, streamText, UIMessage } from "ai";
import type { Context } from "hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import type { MeshContext, OrganizationScope } from "@/core/mesh-context";
import { generatePrefixedId } from "@/shared/utils/generate-id";

import {
  DECOPILOT_BASE_PROMPT,
  DEFAULT_MAX_TOKENS,
  DEFAULT_WINDOW_SIZE,
} from "./constants";
import { processConversation } from "./conversation";
import { ensureOrganization, toolsFromMCP } from "./helpers";
import { createModelProviderFromProxy } from "./model-provider";
import { StreamRequestSchema } from "./schemas";
import { ChatModelConfig, Metadata } from "@/web/components/chat/types";
import { generateTitleInBackground } from "./title-generator";
import { createVirtualClientFrom } from "@/mcp-clients/virtual-mcp";

// ============================================================================
// Request Validation
// ============================================================================

interface ValidatedRequest {
  organization: OrganizationScope;
  model: ChatModelConfig;
  agent: { id: string | null | undefined };
  messages: UIMessage<Metadata>[];
  temperature: number;
  windowSize: number;
  threadId: string | null | undefined;
}

async function validateRequest(
  c: Context<{ Variables: { meshContext: MeshContext } }>,
): Promise<ValidatedRequest> {
  const organization = ensureOrganization(c);
  const rawPayload = await c.req.json();

  const parseResult = StreamRequestSchema.safeParse(rawPayload);
  if (!parseResult.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  return {
    organization,
    model: parseResult.data.model,
    agent: parseResult.data.agent,
    messages: parseResult.data.messages as unknown as UIMessage<Metadata>[],
    temperature: parseResult.data.temperature ?? 0.5,
    windowSize: parseResult.data.memory?.windowSize ?? DEFAULT_WINDOW_SIZE,
    threadId: parseResult.data.thread_id ?? parseResult.data.memory?.threadId,
  };
}

// ============================================================================
// Route Handler
// ============================================================================

const app = new Hono<{ Variables: { meshContext: MeshContext } }>();

app.post("/:org/decopilot/stream", async (c) => {
  try {
    const ctx = c.get("meshContext");

    // 1. Validate request
    const {
      organization,
      model,
      agent,
      messages,
      temperature,
      windowSize,
      threadId,
    } = await validateRequest(c);

    const lastMessage = messages[messages.length - 1];

    // Create virtual MCP client and model provider in parallel
    // For virtual MCPs (agents), we need to use storage.virtualMcps.findById which handles null
    const [virtualMcp, modelClient] = await Promise.all([
      ctx.storage.virtualMcps.findById(agent.id ?? null, organization.id),
      ctx.createMCPProxy(model.connectionId),
    ]);

    if (!virtualMcp) {
      throw new Error("Agent not found");
    }

    const mcpClient = await createVirtualClientFrom(
      virtualMcp,
      ctx,
      "code_execution",
    );

    // 2. Extract tools from virtual MCP client and create model provider
    const [mcpTools, modelProvider] = await Promise.all([
      toolsFromMCP(mcpClient),
      createModelProviderFromProxy(modelClient, {
        modelId: model.id,
        connectionId: model.connectionId,
        cheapModelId: lastMessage?.metadata?.cheapModelId ?? null,
      }),
    ]);

    // CRITICAL: Register abort handler to ensure client cleanup on disconnect
    // Without this, when client disconnects mid-stream, onFinish/onError are NOT called
    // and the MCP client + transport streams leak (TextDecoderStream, 256KB buffers)
    const abortSignal = c.req.raw.signal;

    // Get server instructions if available (for virtual MCP agents)
    const serverInstructions = mcpClient.getInstructions();

    // Build system prompt combining platform instructions with agent-specific instructions
    const systemPrompt = DECOPILOT_BASE_PROMPT(serverInstructions);

    // 3. Process conversation
    const { memory, systemMessages, prunedMessages, originalMessages } =
      await processConversation(ctx, {
        organizationId: organization.id,
        threadId,
        windowSize,
        messages,
        systemPrompts: [systemPrompt],
        model,
      });

    const shouldGenerateTitle = prunedMessages.length === 1;
    const maxOutputTokens = model.limits?.maxOutputTokens ?? DEFAULT_MAX_TOKENS;
    let newTitle: string | null = null;

    // 4. Main stream
    const result = streamText({
      model: modelProvider.model,
      system: systemMessages,
      messages: prunedMessages,
      tools: mcpTools,
      temperature,
      maxOutputTokens,
      abortSignal,
      stopWhen: stepCountIs(30),
      onStepFinish: async () => {
        // Title generation runs after first step's TEXT is already streamed.
        // This blocks the "finish-step" event and subsequent steps (for tool calls),
        // but the response text has already been sent to the client.
        if (shouldGenerateTitle && newTitle === null) {
          const userMessage = JSON.stringify(prunedMessages[0]?.content);
          const modelToUse = modelProvider.cheapModel ?? modelProvider.model;

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

    // 5. Return the stream response with metadata
    return result.toUIMessageStreamResponse({
      originalMessages,
      // consumeSseStream ensures proper abort handling and prevents memory leaks
      consumeSseStream: consumeStream,

      messageMetadata: ({ part }): Metadata => {
        if (part.type === "start") {
          return {
            agent: { id: agent.id ?? null },
            model: { id: model.id, connectionId: model.connectionId },
            created_at: new Date(),
            thread_id: memory.thread.id,
          };
        }
        if (part.type === "reasoning-start") {
          return { reasoning_start_at: new Date() };
        }
        if (part.type === "reasoning-end") {
          return { reasoning_end_at: new Date() };
        }
        if (part.type === "finish-step") {
          return {
            usage: { ...part.usage, providerMetadata: part.providerMetadata },
          };
        }

        if (part.type === "finish") {
          return {
            title: newTitle ?? undefined,
          };
        }
        return {};
      },
      onFinish: async ({
        messages: UIMessages,
        isAborted,
        responseMessage,
      }) => {
        if (isAborted) {
          const userMsg = messages[messages.length - 1];
          const assistantMsg = responseMessage;
          const assistantMsgParts = assistantMsg?.parts ?? [];
          const userMsgParts = userMsg?.parts ?? [];
          if (assistantMsgParts.length === 0 || userMsgParts.length === 0) {
            return;
          }
          const partialMessages: UIMessage<Metadata>[] = [
            {
              id: generatePrefixedId("msg"),
              role: "user",
              parts: userMsgParts,
              metadata: userMsg?.metadata,
            },
            {
              id: generatePrefixedId("msg"),
              role: "assistant",
              parts: assistantMsgParts,
              metadata: assistantMsg?.metadata,
            },
          ];

          const messagesToSave = partialMessages.map((message) => {
            const now = new Date().getTime();
            const createdAt = message.role === "user" ? now : now + 1000;
            return {
              ...message,
              metadata: {
                ...message.metadata,
                title: newTitle ?? undefined,
              },
              createdAt: new Date(createdAt).toISOString(),
              updatedAt: new Date(createdAt).toISOString(),
              threadId: memory.thread.id,
            };
          });
          await memory.save(messagesToSave).catch((error) => {
            console.error(
              "[decopilot:stream] Error saving partial messages",
              error,
            );
          });
          return;
        }
        const messagesToSave = UIMessages.slice(-2).map((message) => {
          const now = new Date().getTime();
          const createdAt = message.role === "user" ? now : now + 1000;
          return {
            ...message,
            metadata: {
              ...message.metadata,
              title: newTitle ?? undefined,
            },
            id: generatePrefixedId("msg"),
            createdAt: new Date(createdAt).toISOString(),
            updatedAt: new Date(createdAt).toISOString(),
            threadId: memory.thread.id,
          };
        });
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

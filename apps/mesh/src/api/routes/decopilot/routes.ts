/**
 * Decopilot Routes
 *
 * HTTP handlers for the Decopilot AI assistant.
 * Uses the Agent, Memory, and ModelProvider abstractions.
 */

import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { stepCountIs, streamText, UIMessage } from "ai";
import type { Context } from "hono";
import { Hono } from "hono";

import type { MeshContext, OrganizationScope } from "@/core/mesh-context";
import {
  generatePrefixedId,
  idMatchesPrefix,
} from "@/shared/utils/generate-id";
import type { ThreadMessage } from "@/storage/types";

import { createAgent as createAgentImpl } from "./agent";
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_WINDOW_SIZE,
  DECOPILOT_BASE_PROMPT,
} from "./constants";
import { processConversation } from "./conversation";
import { ensureOrganization, toolsFromMCP } from "./helpers";
import { createModelProvider } from "./model-provider";
import { StreamRequestSchema } from "./schemas";
import { generateTitleInBackground } from "./title-generator";
import type { Agent } from "./types";
import { createGatewayTransport } from "./transport";

// ============================================================================
// Agent Creation
// ============================================================================

/**
 * Create an Agent connected to a gateway with tools loaded
 */
async function createConnectedAgent(config: {
  organizationId: string;
  threadId?: string | null;
  transport: StreamableHTTPClientTransport;
  monitoringProperties?: Record<string, string>;
}): Promise<Agent> {
  const client = new Client({ name: "mcp-mesh-proxy", version: "1.0.0" });
  await client.connect(config.transport);

  const tools = await toolsFromMCP(client, config.monitoringProperties);
  const agent = createAgentImpl({
    organizationId: config.organizationId,
    client,
    tools,
    systemPrompts: [DECOPILOT_BASE_PROMPT],
  });

  return agent;
}

// ============================================================================
// Request Validation
// ============================================================================

interface ValidatedRequest {
  organization: OrganizationScope;
  model: {
    id: string;
    connectionId: string;
    limits?: { maxOutputTokens?: number };
  };
  gateway: { id: string | null | undefined };
  messages: UIMessage<Metadata>[];
  temperature: number;
  windowSize: number;
  threadId: string | null | undefined;
  transport: StreamableHTTPClientTransport;
}

async function validateRequest(
  c: Context<{ Variables: { meshContext: MeshContext } }>,
): Promise<ValidatedRequest> {
  const organization = ensureOrganization(c);
  const rawPayload = await c.req.json();

  const parseResult = StreamRequestSchema.safeParse(rawPayload);
  if (!parseResult.success) {
    throw new Error("Invalid request body");
  }

  // Validate unique message IDs
  const uniqueIds = new Set<string>();
  for (const m of parseResult.data.messages) {
    if (m.id) uniqueIds.add(m.id);
  }
  if (uniqueIds.size !== parseResult.data.messages.length) {
    throw new Error("Duplicate message IDs");
  }

  // Validate thread ID format
  if (parseResult.data.thread_id) {
    if (!idMatchesPrefix(parseResult.data.thread_id, "thrd")) {
      throw new Error("Invalid thread ID");
    }
  }

  // Validate gateway ID format
  if (parseResult.data.gateway.id) {
    if (!idMatchesPrefix(parseResult.data.gateway.id, "gw")) {
      throw new Error("Invalid gateway ID");
    }
  }

  const transport = createGatewayTransport(
    c.req.raw,
    organization.id,
    parseResult.data.gateway.id,
  );

  return {
    organization,
    model: parseResult.data.model,
    gateway: parseResult.data.gateway,
    transport,
    messages: parseResult.data.messages as unknown as UIMessage<Metadata>[],
    temperature: parseResult.data.temperature ?? 0.5,
    windowSize: parseResult.data.memory?.windowSize ?? DEFAULT_WINDOW_SIZE,
    threadId: parseResult.data.thread_id,
  };
}

// ============================================================================
// Route Handler
// ============================================================================

const app = new Hono<{ Variables: { meshContext: MeshContext } }>();

app.post("/:org/decopilot/stream", async (c) => {
  const ctx = c.get("meshContext");
  let agent: Agent | null = null;

  try {
    // 1. Validate request
    const {
      organization,
      model,
      gateway,
      messages,
      temperature,
      windowSize,
      threadId,
      transport,
    } = await validateRequest(c);

    // 2. Create agent, model provider, and process conversation in parallel
    const [createdAgent, modelProvider] = await Promise.all([
      createConnectedAgent({
        organizationId: organization.id,
        threadId,
        transport,
        monitoringProperties: {},
      }),
      createModelProvider(ctx, {
        organizationId: organization.id,
        modelId: model.id,
        connectionId: model.connectionId,
      }),
    ]);

    agent = createdAgent;

    // 3. Process conversation (depends on agent for system prompts)
    const {
      memory,
      systemMessages,
      prunedMessages,
      userMessages,
      userCreatedAt,
    } = await processConversation(ctx, agent, {
      organizationId: organization.id,
      threadId,
      windowSize,
      messages,
    });

    const maxOutputTokens = model.limits?.maxOutputTokens ?? DEFAULT_MAX_TOKENS;

    // 4. Extract first user message for title generation
    const firstUserMessage = userMessages[0];
    const userText =
      firstUserMessage?.parts
        ?.map((p: { type: string; text?: string }) =>
          p.type === "text" ? p.text : "",
        )
        .join("") || "";

    const shouldGenerateTitle =
      userText.length > 0 && prunedMessages.length <= 1;
    let generatedTitle: string | null = null;

    // Start title generation in background
    if (shouldGenerateTitle) {
      generateTitleInBackground({
        model: modelProvider.model,
        userMessage: userText,
        onTitle: (title) => {
          generatedTitle = title;
        },
      }).catch((err) => {
        console.error("[decopilot:title] Background error:", err);
      });
    }

    // 5. Main agent stream
    const result = streamText({
      model: modelProvider.model,
      system: systemMessages,
      messages: prunedMessages,
      tools: agent.tools,
      temperature,
      maxOutputTokens,
      abortSignal: c.req.raw.signal,
      stopWhen: stepCountIs(30),
      onError: async (error) => {
        console.error("[decopilot:stream] Error", error);
        if (agent) {
          await agent.close().catch(console.error);
        }
      },
      onFinish: async () => {
        console.log("[decopilot:stream] ✅ Stream finished, closing agent", {
          organizationId: agent?.organizationId,
          contextSnapshot: agent?.context.snapshot(),
          generatedTitle,
        });
        if (agent) {
          await agent.close().catch(console.error);
        }
      },
    });

    result.consumeStream();

    // 6. Return the stream response with metadata
    return result.toUIMessageStreamResponse({
      messageMetadata: ({ part }): Metadata => {
        if (part.type === "start") {
          return {
            gateway: { id: gateway.id ?? null },
            model: { id: model.id, connectionId: model.connectionId },
            created_at: new Date(),
            thread_id: memory.thread.id,
            ...(generatedTitle ? { thread_title: generatedTitle } : {}),
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
            ...(generatedTitle ? { thread_title: generatedTitle } : {}),
          };
        }
        return {};
      },
      onFinish: async ({ responseMessage }) => {
        const responseCreatedAt = new Date().toISOString();
        const lastUserMessage = userMessages[userMessages.length - 1];

        const messagesToSave: ThreadMessage[] = [
          {
            ...(responseMessage as ThreadMessage),
            threadId: memory.thread.id,
            id: generatePrefixedId("msg"),
            createdAt: responseCreatedAt,
            updatedAt: responseCreatedAt,
          },
        ];

        if (lastUserMessage) {
          messagesToSave.unshift({
            ...lastUserMessage,
            role: "user",
            parts: lastUserMessage.parts as ThreadMessage["parts"],
            id: generatePrefixedId("msg"),
            threadId: memory.thread.id,
            createdAt: userCreatedAt,
            updatedAt: userCreatedAt,
          });
        }

        console.log("[decopilot:memory] 💾 Saving messages", {
          threadId: memory.thread.id,
          messageCount: messagesToSave.length,
          generatedTitle,
        });

        if (generatedTitle) {
          await ctx.storage.threads
            .update(memory.thread.id, { title: generatedTitle })
            .catch((err) => {
              console.error("[decopilot:title] Failed to save title:", err);
            });
        }

        await memory.save(messagesToSave).catch((error) => {
          console.error("[decopilot:stream] Error saving messages", error);
        });

        console.log("[decopilot:memory] ✅ Messages saved");
      },
    });
  } catch (error) {
    await agent?.close().catch(console.error);
    const err = error as Error;

    console.error("[decopilot:stream] Error", err);

    if (err.name === "AbortError") {
      console.warn("[decopilot:stream] Aborted", { error: err.message });
      return c.json({ error: "Request aborted" }, 400);
    }

    console.error("[decopilot:stream] Failed", {
      error: err.message,
      stack: err.stack,
    });
    return c.json({ error: err.message }, 500);
  }
});

export default app;

/**
 * Decopilot Routes
 *
 * HTTP handlers for the Decopilot AI assistant.
 * Uses the Agent, Memory, and ModelProvider abstractions.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { stepCountIs, streamText, UIMessage } from "ai";
import type { Context } from "hono";
import { Hono } from "hono";

import type { MeshContext, OrganizationScope } from "@/core/mesh-context";
import { generatePrefixedId } from "@/shared/utils/generate-id";

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
import type { Agent } from "./types";
import { createVirtualMcpTransport } from "./transport";
import { Metadata } from "@/web/components/chat/types";

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

  return {
    organization,
    model: parseResult.data.model,
    gateway: parseResult.data.gateway,
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
    } = await validateRequest(c);
    const transport = createVirtualMcpTransport(
      c.req.raw,
      organization.id,
      gateway.id,
    );

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

    // CRITICAL: Register abort handler to ensure client cleanup on disconnect
    // Without this, when client disconnects mid-stream, onFinish/onError are NOT called
    // and the MCP client + transport streams leak (TextDecoderStream, 256KB buffers)
    const abortSignal = c.req.raw.signal;
    const abortHandler = () => {
      console.log("[models:stream] Request aborted - closing MCP client");
      agent?.client?.close().catch(console.error);
    };
    abortSignal.addEventListener("abort", abortHandler, { once: true });

    // 3. Process conversation (depends on agent for system prompts)
    const { memory, systemMessages, prunedMessages, originalMessages } =
      await processConversation(ctx, agent, {
        organizationId: organization.id,
        threadId,
        windowSize,
        messages,
      });

    const maxOutputTokens = model.limits?.maxOutputTokens ?? DEFAULT_MAX_TOKENS;

    // 5. Main agent stream
    const result = streamText({
      model: modelProvider.model,
      system: systemMessages,
      messages: prunedMessages,
      tools: agent.tools,
      temperature,
      maxOutputTokens,
      abortSignal,
      stopWhen: stepCountIs(30),
      onError: async (error) => {
        console.error("[decopilot:stream] Error", error);
        abortSignal.removeEventListener("abort", abortHandler);
        await agent?.close().catch(console.error);
      },
      onFinish: async () => {
        console.log("[decopilot:stream] ✅ Stream finished, closing agent", {
          organizationId: agent?.organizationId,
          contextSnapshot: agent?.context.snapshot(),
        });
        abortSignal.removeEventListener("abort", abortHandler);
        await agent?.close().catch(console.error);
      },
    });
    console.log({
      originalMessages: JSON.stringify(originalMessages, null, 2),
    });

    // 6. Return the stream response with metadata
    return result.toUIMessageStreamResponse({
      originalMessages,
      messageMetadata: ({ part }): Metadata => {
        if (part.type === "start") {
          return {
            gateway: { id: gateway.id ?? null },
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
        return {};
      },
      onFinish: async ({ messages: UIMessages }) => {
        console.log({
          UIMessages: UIMessages.map((message) => ({
            metadata: JSON.stringify(message.metadata, null, 2),
            parts: JSON.stringify(message.parts, null, 2),
            role: message.role,
            id: message.id,
          })),
        });

        const messagesToSave = UIMessages.slice(-2).map((message) => {
          const now = new Date().getTime();
          const createdAt = message.role === "user" ? now : now + 1000;
          return {
            ...message,
            id: generatePrefixedId("msg"),
            createdAt: new Date(createdAt).toISOString(),
            updatedAt: new Date(createdAt).toISOString(),
            threadId: memory.thread.id,
          };
        });
        console.log({
          messagesToSave: messagesToSave.map((message) => ({
            metadata: message.metadata,
            createdAt: message.createdAt,
            role: message.role,
            id: message.id,
          })),
        });

        console.log("[decopilot:memory] 💾 Saving messages", {
          threadId: memory.thread.id,
          messageCount: messagesToSave.length,
        });

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

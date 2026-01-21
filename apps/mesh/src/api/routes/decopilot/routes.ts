/**
 * Decopilot Routes
 *
 * HTTP handlers for the Decopilot AI assistant.
 * Uses Memory and ModelProvider abstractions.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { stepCountIs, streamText, UIMessage } from "ai";
import type { Context } from "hono";
import { Hono } from "hono";

import type { MeshContext, OrganizationScope } from "@/core/mesh-context";
import { generatePrefixedId } from "@/shared/utils/generate-id";

import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_WINDOW_SIZE,
  DECOPILOT_BASE_PROMPT,
} from "./constants";
import { processConversation } from "./conversation";
import { ensureOrganization, toolsFromMCP } from "./helpers";
import { createModelProvider } from "./model-provider";
import { StreamRequestSchema } from "./schemas";
import { createVirtualMcpTransport } from "./transport";
import { Metadata } from "@/web/components/chat/types";
import { generateTitleInBackground } from "./title-generator";

// ============================================================================
// MCP Client Connection
// ============================================================================

/**
 * Create and connect an MCP client with tools loaded
 */
async function createConnectedClient(config: {
  transport: StreamableHTTPClientTransport;
  monitoringProperties?: Record<string, string>;
}) {
  const client = new Client({ name: "mcp-mesh-proxy", version: "1.0.0" });
  await client.connect(config.transport);

  const tools = await toolsFromMCP(client, config.monitoringProperties);

  return { client, tools };
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
  let client: Client | null = null;

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

    // 2. Create MCP client and model provider in parallel
    const [{ client: mcpClient, tools }, modelProvider] = await Promise.all([
      createConnectedClient({
        transport,
        monitoringProperties: {},
      }),
      createModelProvider(ctx, {
        organizationId: organization.id,
        modelId: model.id,
        connectionId: model.connectionId,
      }),
    ]);

    client = mcpClient;

    // CRITICAL: Register abort handler to ensure client cleanup on disconnect
    // Without this, when client disconnects mid-stream, onFinish/onError are NOT called
    // and the MCP client + transport streams leak (TextDecoderStream, 256KB buffers)
    const abortSignal = c.req.raw.signal;
    const abortHandler = () => {
      client?.close().catch(console.error);
    };
    abortSignal.addEventListener("abort", abortHandler, { once: true });

    // 3. Process conversation
    const { memory, systemMessages, prunedMessages, originalMessages } =
      await processConversation(ctx, {
        organizationId: organization.id,
        threadId,
        windowSize,
        messages,
        systemPrompts: [DECOPILOT_BASE_PROMPT],
      });

    const shouldGenerateTitle = prunedMessages.length === 1;
    const maxOutputTokens = model.limits?.maxOutputTokens ?? DEFAULT_MAX_TOKENS;
    let newTitle: string | null = null;

    // 4. Main stream
    const result = streamText({
      model: modelProvider.model,
      system: systemMessages,
      messages: prunedMessages,
      tools,
      temperature,
      maxOutputTokens,
      abortSignal,
      stopWhen: stepCountIs(30),
      onStepFinish: async () => {
        if (shouldGenerateTitle && newTitle === null) {
          const userMessage = JSON.stringify(prunedMessages[0]?.content);

          await generateTitleInBackground({
            abortSignal,
            model: modelProvider.model,
            userMessage,
            onTitle: (title) => {
              newTitle = title;
            },
          })
            .catch((error) => {
              console.error("[decopilot:stream] Error generating title", error);
            })
        }
      },
      onError: async (error) => {
        console.error("[decopilot:stream] Error", error);
        abortSignal.removeEventListener("abort", abortHandler);
        await client?.close().catch(console.error);
      },
      onFinish: async () => {
        abortSignal.removeEventListener("abort", abortHandler);
        await client?.close().catch(console.error);
      },
    });

    // 5. Return the stream response with metadata
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

        if (part.type === "finish") {
          return {
            title: newTitle ?? undefined,
          };
        }
        return {};
      },
      onFinish: async ({ messages: UIMessages }) => {
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
  } catch (error) {
    await client?.close().catch(console.error);
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

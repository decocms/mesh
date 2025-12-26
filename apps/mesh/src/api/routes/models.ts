import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { LanguageModelBinding } from "@decocms/bindings/llm";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText,
} from "ai";
import { Hono } from "hono";
import { z } from "zod";
import type { MeshContext } from "../../core/mesh-context";
import type { ConnectionEntity } from "../../tools/connection/schema";
import { createLLMProvider } from "../llm-provider";
import { fixProtocol } from "./oauth-proxy";

// Default values
const DEFAULT_MAX_TOKENS = 32768;
const DEFAULT_MEMORY = 50; // last N messages to keep

const StreamRequestSchema = z.object({
  messages: z.any(), // Complex type from frontend, keeping as any
  model: z
    .object({
      id: z.string(),
      connectionId: z.string(),
      provider: z
        .enum([
          "openai",
          "anthropic",
          "google",
          "xai",
          "deepseek",
          "openrouter",
          "openai-compatible",
        ])
        .optional()
        .nullable(),
    })
    .passthrough()
    .optional(),
  gateway: z.object({ id: z.string() }).passthrough().optional(),
  stream: z.boolean().optional(),
  temperature: z.number().optional(),
  maxOutputTokens: z.number().optional(),
  maxWindowSize: z.number().optional(),
  thread_id: z.string().optional(),
});

export type StreamRequest = z.infer<typeof StreamRequestSchema>;

const app = new Hono<{ Variables: { meshContext: MeshContext } }>();

function ensureOrganization(ctx: MeshContext, orgSlug: string) {
  if (!ctx.organization) {
    throw new Error("Organization context is required");
  }

  if (ctx.organization.slug !== orgSlug) {
    throw new Error("Organization slug mismatch");
  }

  return ctx.organization;
}

async function getConnectionById(
  ctx: MeshContext,
  organizationId: string,
  connectionId: string,
): Promise<ConnectionEntity | null> {
  const connection = await ctx.storage.connections.findById(connectionId);

  if (!connection) {
    return null;
  }

  if (connection.organization_id !== organizationId) {
    throw new Error("Connection does not belong to organization");
  }

  if (connection.status !== "active") {
    throw new Error(
      `Connection is ${connection.status.toUpperCase()}, not active`,
    );
  }

  return connection;
}

function createGatewayTransport(
  req: Request,
  gatewayId: string,
): StreamableHTTPClientTransport {
  // Build base URL for gateway
  const url = fixProtocol(new URL(req.url));
  const baseUrl = `${url.protocol}//${url.host}`;

  // Forward cookie and authorization headers
  const headers = new Headers();
  const toProxy = ["cookie", "authorization"];
  for (const header of toProxy) {
    if (req.headers.has(header)) {
      headers.set(header, req.headers.get(header)!);
    }
  }

  return new StreamableHTTPClientTransport(
    new URL(`/mcp/gateway/${gatewayId}`, baseUrl),
    { requestInit: { headers } },
  );
}

app.post("/:org/models/stream", async (c) => {
  const ctx = c.get("meshContext");
  const orgSlug = c.req.param("org");

  // MCP client will be initialized after validation
  let mcpClient: MCPClient | null = null;

  try {
    const organization = ensureOrganization(ctx, orgSlug);
    const rawPayload = await c.req.json();

    // Validate request using Zod schema
    const parseResult = StreamRequestSchema.safeParse(rawPayload);
    if (!parseResult.success) {
      return c.json(
        {
          error: "Invalid request body",
          details: parseResult.error.issues,
        },
        400,
      );
    }

    const payload = parseResult.data;

    // Validate model is provided
    if (!payload.model) {
      return c.json({ error: "model is required" }, 400);
    }

    const {
      model: modelConfig,
      gateway: gatewayConfig,
      messages,
      temperature,
      maxOutputTokens = DEFAULT_MAX_TOKENS,
      maxWindowSize = DEFAULT_MEMORY,
      thread_id: threadId,
    } = payload;

    // Validate gateway is provided
    if (!gatewayConfig?.id) {
      return c.json({ error: "gateway is required" }, 400);
    }

    const transport = createGatewayTransport(c.req.raw, gatewayConfig.id);

    // Convert UIMessages to CoreMessages and create MCP proxy/client in parallel
    const [modelMessages, connection, client] = await Promise.all([
      convertToModelMessages(messages, { ignoreIncompleteToolCalls: true }),
      getConnectionById(ctx, organization.id, modelConfig.connectionId),
      createMCPClient({ transport }),
    ]);

    if (!connection) {
      return c.json(
        { error: `Model connection not found: ${modelConfig.connectionId}` },
        404,
      );
    }

    // Prune messages to reduce context size
    const prunedMessages = pruneMessages({
      messages: modelMessages,
      reasoning: "before-last-message",
      emptyMessages: "remove",
      toolCalls: "none",
    }).slice(-maxWindowSize);

    const [proxy, tools] = await Promise.all([
      ctx.createMCPProxy(connection),
      client.tools({ schemas: "automatic" }),
    ]);

    mcpClient = client;
    const llmBinding = LanguageModelBinding.forClient(proxy);
    const provider = createLLMProvider(llmBinding).languageModel(
      modelConfig.id,
    );

    // Use streamText from AI SDK with pruned messages and parameters
    const result = streamText({
      model: provider,
      messages: prunedMessages,
      tools,
      temperature,
      maxOutputTokens,
      abortSignal: c.req.raw.signal,
      stopWhen: stepCountIs(30), // Stop after 30 steps with tool calls
      onError: async (error) => {
        console.error("[models:stream] Error", error);
        await mcpClient?.close().catch(console.error);
      },
      onFinish: async () => {
        await mcpClient?.close().catch(console.error);
      },
    });

    // Return the stream using toUIMessageStreamResponse
    return result.toUIMessageStreamResponse({
      messageMetadata: ({ part }): Metadata => {
        if (part.type === "start") {
          return {
            gateway: gatewayConfig,
            model: modelConfig,
            created_at: new Date(),
            thread_id: threadId,
          };
        }

        if (part.type === "finish-step") {
          const usage = part.usage;
          return {
            usage: {
              ...usage,
              providerMetadata: part.providerMetadata,
            },
          };
        }
        return {};
      },
    });
  } catch (error) {
    const err = error as Error;

    // Cleanup MCP client on error
    await mcpClient?.close().catch(console.error);

    if (err.name === "AbortError") {
      console.warn(
        "[models:stream] Aborted",
        JSON.stringify({
          org: orgSlug,
        }),
      );
      return c.json({ error: "Request aborted" }, 400);
    }
    console.error(
      "[models:stream] Failed",
      JSON.stringify({
        org: orgSlug,
        error: err.message,
        stack: err.stack,
      }),
    );
    return c.json({ error: err.message }, 500);
  }
});

export default app;

import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { LanguageModelBinding } from "@decocms/bindings/llm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  type CallToolResult,
  CallToolResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  convertToModelMessages,
  jsonSchema,
  JSONSchema7,
  JSONValue,
  pruneMessages,
  stepCountIs,
  streamText,
  SystemModelMessage,
  tool,
  ToolSet,
} from "ai";
import { Context, Hono } from "hono";
import { z } from "zod";
import type { MeshContext, OrganizationScope } from "../../core/mesh-context";
import type { ConnectionEntity } from "../../tools/connection/schema";
import { createLLMProvider } from "../llm-provider";
import { fixProtocol } from "./oauth-proxy";
import { Thread, ThreadMessage } from "@/storage/types";
import type { UIMessage } from "ai";
import {
  generatePrefixedId,
  idMatchesPrefix,
} from "@/shared/utils/generate-id";

// Default values
const DEFAULT_MAX_TOKENS = 32768;
const DEFAULT_MEMORY = 50; // last N messages to keep

/**
 * Decopilot System Prompt
 *
 * Base instructions for the AI assistant running in the MCP Mesh environment.
 * This prompt is prepended to any user-provided context from the frontend.
 */
const DECOPILOT_SYSTEM_MESSAGE: SystemModelMessage = {
  role: "system",
  content: `You are an AI assistant running in an MCP Mesh environment.

## About MCP Mesh

The Model Context Protocol (MCP) Mesh allows users to connect external services and expose their capabilities through a unified interface.

### Terminology
- **Agents** (also called **Gateways**): Entry points that provide access to a curated set of tools from connected services
- **Connections** (also called **MCP Servers**): External services integrated into the mesh that expose tools, resources, and prompts

The user is currently interacting with one of these agents/gateways and may ask questions about these entities or the resources they expose.

## Interaction Guidelines

Follow this state machine when handling user requests:

1. **Understand Intent**: If the user asks something trivial (greetings, simple questions), respond directly without tool exploration.

2. **Tool Discovery**: For non-trivial requests, search and explore available tools to understand what capabilities are at your disposal.

3. **Tool Selection**: After discovery, decide which tools are appropriate for the task. Describe the chosen tools to the user, explaining what they do and how they help.

4. **Execution**: Execute the tools thoughtfully and produce a final answer. Prefer aggregations and summaries over raw results. Return only the subset of information relevant to the user's request.

## Important Notes
- All tool calls are logged and audited for security and compliance
- You have access to the tools exposed through the selected agent/gateway
- Connections may expose resources that users can browse and edit
- When users mention "agents", they are typically referring to gateways`,
};

/**
 * UIMessage schema for incoming user messages.
 * Uses a permissive parts schema because AI SDK UIMessagePart has many types
 * (text, reasoning, tool-call, tool-result, file, etc.) that evolve with the SDK.
 * Validates essential structure while allowing flexibility for part types.
 */
const UIMessageSchema = z.looseObject({
  id: z.string().optional(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(z.record(z.string(), z.unknown())),
  metadata: z.unknown().optional(),
});

const ThreadMemoryConfigSchema = z.object({
  windowSize: z.number().optional(),
  threadId: z.string(),
});

const StreamRequestSchema = z.object({
  messages: z.array(UIMessageSchema).describe("User messages"),
  memory: ThreadMemoryConfigSchema.optional(),
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
      limits: z
        .object({
          contextWindow: z.number().optional(),
          maxOutputTokens: z.number().optional(),
        })
        .optional(),
    })
    .loose(),
  gateway: z.object({ id: z.string().nullable() }).loose(),
  stream: z.boolean().optional(),
  temperature: z.number().optional(),
  thread_id: z.string().optional(),
});

export type StreamRequest = z.infer<typeof StreamRequestSchema>;

const app = new Hono<{ Variables: { meshContext: MeshContext } }>();

function ensureOrganization(
  c: Context<{ Variables: { meshContext: MeshContext } }>,
) {
  const organization = c.get("meshContext").organization;
  if (!organization) {
    throw new Error("Organization context is required");
  }

  if ((organization.slug ?? organization.id) !== c.req.param("org")) {
    throw new Error("Organization mismatch");
  }

  return organization;
}

function ensureUser(ctx: MeshContext) {
  if (!ctx.auth?.user?.id) {
    throw new Error("User ID is required");
  }
  return ctx.auth.user.id;
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

/**
 * Converts MCP tools to AI SDK tools.
 * Optionally injects properties into tool call arguments for monitoring correlation.
 */
const toolsFromMCP = async (
  client: Client,
  properties?: Record<string, string>,
): Promise<ToolSet> => {
  const list = await client.listTools();

  const toolEntries = list.tools.map((t) => {
    const { name, title, description, inputSchema, outputSchema } = t;

    return [
      name,
      tool<Record<string, unknown>, CallToolResult>({
        title: title ?? name,
        description,
        inputSchema: jsonSchema(inputSchema as JSONSchema7),
        outputSchema: outputSchema
          ? jsonSchema(outputSchema as JSONSchema7)
          : undefined,
        execute: (input, options) => {
          // Inject properties via _meta for monitoring correlation
          const argsWithMeta =
            properties && Object.keys(properties).length > 0
              ? { ...input, _meta: { properties } }
              : input;

          return client.callTool(
            {
              name: t.name,
              arguments: argsWithMeta as Record<string, unknown>,
            },
            CallToolResultSchema,
            { signal: options.abortSignal },
          ) as Promise<CallToolResult>;
        },
        toModelOutput: ({ output }) => {
          if (output.isError) {
            const textContent = output.content
              .map((c) => (c.type === "text" ? c.text : null))
              .filter(Boolean)
              .join("\n");

            return {
              type: "error-text",
              value: textContent || "Unknown error",
            };
          }
          if ("structuredContent" in output) {
            return {
              type: "json",
              value: output.structuredContent as JSONValue,
            };
          }
          return { type: "content", value: output.content as any };
        },
      }),
    ];
  });

  return Object.fromEntries(toolEntries);
};

function createGatewayTransport(
  req: Request,
  organizationId: string,
  gatewayId: string | null | undefined,
): StreamableHTTPClientTransport {
  // Build base URL for gateway
  const url = fixProtocol(new URL(req.url));
  const baseUrl = `${url.protocol}//${url.host}`;

  // Forward cookie and authorization headers
  const headers = new Headers([["x-org-id", organizationId]]);
  const toProxy = ["cookie", "authorization"];
  for (const header of toProxy) {
    if (req.headers.has(header)) {
      headers.set(header, req.headers.get(header)!);
    }
  }

  // Use /mcp/gateway/ for default, /mcp/gateway/:id for specific gateway
  const gatewayPath = gatewayId ? `/mcp/gateway/${gatewayId}` : "/mcp/gateway";
  const gatewayUrl = new URL(gatewayPath, baseUrl);
  gatewayUrl.searchParams.set("mode", "code_execution");

  return new StreamableHTTPClientTransport(gatewayUrl, {
    requestInit: { headers },
  });
}

async function getOrCreateThread(
  ctx: MeshContext,
  {
    threadId,
    organizationId,
  }: {
    threadId: string | null | undefined;
    organizationId: string;
  },
): Promise<{ thread: Thread; messages: ThreadMessage[] }> {
  const userId = ensureUser(ctx);
  const isValidId = threadId ? idMatchesPrefix(threadId, "thrd") : false;

  if (!threadId || !isValidId) {
    const thread = await ctx.storage.threads.create({
      id: generatePrefixedId("thrd"),
      organizationId,
      createdBy: userId,
    });
    return { thread, messages: [] };
  } else if (threadId) {
    const thread = await ctx.storage.threads.get(threadId);
    // Verify thread exists AND belongs to the current organization
    // If thread belongs to a different org, treat as "not found" (don't leak info)
    // and create a new thread with a fresh ID to avoid conflicts
    if (!thread || thread.organizationId !== organizationId) {
      const newThread = await ctx.storage.threads.create({
        id: thread ? generatePrefixedId("thrd") : threadId,
        organizationId,
        createdBy: userId,
      });
      return { thread: newThread, messages: [] };
    }
    const { messages } = await ctx.storage.threads.listMessages(thread.id);
    return { thread, messages };
  }

  throw new Error(
    "Thread not found. If you are trying to create a new thread, do not send a threadId.",
  );
}

function createGatewayClient() {
  return new Client({ name: "mcp-mesh-proxy", version: "1.0.0" });
}

async function createModelProviderForConnection(
  ctx: MeshContext,
  organizationId: string,
  model: { id: string; connectionId: string },
) {
  const connection = await getConnectionById(
    ctx,
    organizationId,
    model.connectionId,
  );
  if (!connection) {
    throw new Error(`Connection not found: ${model.connectionId}`);
  }
  const proxy = await ctx.createMCPProxy(connection);

  const llmBinding = LanguageModelBinding.forClient(proxy);
  const provider = createLLMProvider(llmBinding).languageModel(model.id);

  return provider;
}

async function createAgent({
  monitoringProperties,
  transport,
}: {
  monitoringProperties: Record<string, string>;
  transport: StreamableHTTPClientTransport;
}) {
  const client = createGatewayClient();
  await client.connect(transport);
  const tools = await toolsFromMCP(client, monitoringProperties);
  return { client, tools };
}

async function validateRequest(
  c: Context<{ Variables: { meshContext: MeshContext } }>,
): Promise<{
  organization: OrganizationScope;
  model: {
    id: string;
    connectionId: string;
    limits?: { maxOutputTokens?: number };
  };
  gateway: { id: string | null | undefined };
  messages: UIMessage<Metadata>[];
  temperature: number;
  memory: z.infer<typeof ThreadMemoryConfigSchema>;
  thread_id: string | null | undefined;
  transport: StreamableHTTPClientTransport;
}> {
  const organization = ensureOrganization(c);
  const rawPayload = await c.req.json();

  // Validate request using Zod schema
  const parseResult = StreamRequestSchema.safeParse(rawPayload);
  if (!parseResult.success) {
    throw new Error("Invalid request body");
  }

  const uniqueIds = new Set<string>();
  parseResult.data.messages.forEach((m) => {
    if (m.id) {
      uniqueIds.add(m.id);
    }
  });
  if (uniqueIds.size !== parseResult.data.messages.length) {
    throw new Error("Duplicate message IDs");
  }

  if (parseResult.data.thread_id) {
    if (!idMatchesPrefix(parseResult.data.thread_id, "thrd")) {
      throw new Error("Invalid thread ID");
    }
  }

  if (parseResult.data.gateway.id) {
    if (!idMatchesPrefix(parseResult.data.gateway.id, "gw")) {
      throw new Error("Invalid gateway ID");
    }
  }
  const gateway = parseResult.data.gateway;

  const transport = createGatewayTransport(
    c.req.raw,
    organization.id,
    gateway.id,
  );

  return {
    organization,
    model: parseResult.data.model,
    gateway,
    transport,
    messages: parseResult.data.messages as unknown as UIMessage<Metadata>[],
    temperature: parseResult.data.temperature ?? 0.5,
    memory: parseResult.data.memory ?? {
      threadId: parseResult.data.thread_id ?? "",
      windowSize: DEFAULT_MEMORY,
    },
    thread_id: parseResult.data.thread_id,
  };
}

async function getMessagesAndThread({
  ctx,
  memory,
  messages,
  thread_id,
  organization_id,
}: {
  ctx: MeshContext;
  memory: z.infer<typeof ThreadMemoryConfigSchema>;
  messages: UIMessage<Metadata>[];
  thread_id: string | null | undefined;
  organization_id: string;
}) {
  const { thread, messages: threadMessages } = await getOrCreateThread(ctx, {
    threadId: thread_id,
    organizationId: organization_id,
  });
  const modelMessages = await convertToModelMessages(
    [...threadMessages, ...messages],
    {
      ignoreIncompleteToolCalls: true,
    },
  );
  const userCreatedAt = new Date().toISOString();

  // Safe cast: UIMessageSchema validated required structure (parts, role, metadata)
  const userMessages = messages.filter(
    (m) => m.role === "user",
  ) as unknown as UIMessage<Metadata>[];
  userMessages.forEach((m) => {
    const safeUserMessage = {
      ...m,
      parts: m.parts as ThreadMessage["parts"],
      id: generatePrefixedId("msg"),
      threadId: thread.id,
      createdAt: userCreatedAt,
      metadata: m.metadata as ThreadMessage["metadata"],
      updatedAt: userCreatedAt,
    };
    threadMessages.push(safeUserMessage as ThreadMessage);
  });

  const safeSystemMessages = messages.filter(
    (m) => m.role === "system",
  ) as unknown as SystemModelMessage[];
  safeSystemMessages.forEach((m) => {
    const safeSystemMessage = {
      ...m,
      id: generatePrefixedId("msg"),
      threadId: thread.id,
      createdAt: userCreatedAt,
      updatedAt: userCreatedAt,
    };
    threadMessages.push(safeSystemMessage as unknown as ThreadMessage);
  });

  // Extract context from frontend system message and combine with base prompt
  const systemMessages = [
    DECOPILOT_SYSTEM_MESSAGE,
    ...modelMessages.filter((m) => m.role === "system"),
  ].filter(Boolean) as SystemModelMessage[];

  // Filter out system messages (they go to system param, not messages array)
  const nonSystemMessages = modelMessages.filter((m) => m.role !== "system");
  const windowSize = memory.windowSize ?? DEFAULT_MEMORY;
  if (windowSize <= 0) {
    throw new Error("Window size must be greater than 0");
  }
  // Prune messages to reduce context size
  const prunedMessages = pruneMessages({
    messages: nonSystemMessages,
    reasoning: "before-last-message",
    emptyMessages: "remove",
    toolCalls: "none",
  }).slice(-windowSize);

  return {
    prunedMessages,
    systemMessages,
    userMessages,
    userCreatedAt,
    threadMessages,
    thread,
  };
}

app.post("/:org/decopilot/stream", async (c) => {
  const ctx = c.get("meshContext");
  // MCP client will be initialized after validation
  let mcpClient: Client | null = null;

  try {
    const {
      organization,
      model,
      gateway,
      messages,
      temperature,
      memory,
      thread_id,
      transport,
    } = await validateRequest(c);

    // Run all three independent operations in parallel for better latency
    const [
      { client, tools },
      provider,
      { prunedMessages, systemMessages, userMessages, userCreatedAt, thread },
    ] = await Promise.all([
      createAgent({ monitoringProperties: {}, transport }),
      createModelProviderForConnection(ctx, organization.id, model),
      getMessagesAndThread({
        ctx,
        memory,
        messages,
        thread_id,
        organization_id: organization.id,
      }),
    ]);

    mcpClient = client;
    const maxOutputTokens = model.limits?.maxOutputTokens ?? DEFAULT_MAX_TOKENS;

    // Use streamText from AI SDK with pruned messages and parameters
    const result = streamText({
      model: provider,
      system: systemMessages,
      messages: prunedMessages,
      tools,
      temperature,
      maxOutputTokens: maxOutputTokens,
      abortSignal: c.req.raw.signal,
      stopWhen: stepCountIs(30), // Stop after 30 steps with tool calls
      onError: async (error) => {
        console.error("[models:stream] Error", error);
        client.close().catch(console.error);
      },
      onFinish: async () => {
        client.close().catch(console.error);
      },
    });

    // Return the stream using toUIMessageStreamResponse
    return result.toUIMessageStreamResponse({
      messageMetadata: ({ part }): Metadata => {
        if (part.type === "start") {
          return {
            gateway: { id: gateway.id ?? null },
            model: { id: model.id, connectionId: model.connectionId },
            created_at: new Date(),
            thread_id: thread!.id,
          };
        }

        if (part.type === "reasoning-start") {
          return {
            reasoning_start_at: new Date(),
          };
        }

        if (part.type === "reasoning-end") {
          return {
            reasoning_end_at: new Date(),
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
      onFinish: async ({ responseMessage }) => {
        // Both messages get explicit timestamps:
        // - userMessage already has createdAt set before streaming
        // - responseMessage gets current time after streaming completes
        // This ensures proper ordering since response always finishes after request.
        const responseCreatedAt = new Date().toISOString();
        const lastUserMessage = userMessages[userMessages.length - 1];

        const messagesToSave: ThreadMessage[] = [
          {
            ...(responseMessage as ThreadMessage),
            threadId: thread.id,
            id: generatePrefixedId("msg"),
            createdAt: responseCreatedAt,
            updatedAt: responseCreatedAt,
          },
        ];

        // Only include user message if one exists
        if (lastUserMessage) {
          messagesToSave.unshift({
            ...lastUserMessage,
            role: "user",
            parts: lastUserMessage.parts as ThreadMessage["parts"],
            id: generatePrefixedId("msg"),
            threadId: thread.id,
            createdAt: userCreatedAt,
            updatedAt: userCreatedAt,
          });
        }

        await ctx.storage.threads
          .saveMessages(messagesToSave)
          .catch((error) => {
            console.error("[models:stream] Error saving messages", error);
            return c.json(
              { error: "Failed to save messages after streaming" },
              500,
            );
          });
      },
    });
  } catch (error) {
    await mcpClient?.close().catch(console.error);
    const err = error as Error;

    console.error("[models:stream] Error", err);

    if (err.name === "AbortError") {
      console.warn(
        "[models:stream] Aborted",
        JSON.stringify({
          error: err.message,
          stack: err.stack,
        }),
      );
      return c.json({ error: "Request aborted" }, 400);
    }
    console.error(
      "[models:stream] Failed",
      JSON.stringify({
        error: err.message,
        stack: err.stack,
      }),
    );
    return c.json({ error: err.message }, 500);
  }
});

export default app;

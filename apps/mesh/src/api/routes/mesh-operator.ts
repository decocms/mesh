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
import { Hono } from "hono";
import { z } from "zod";
import type { MeshContext } from "../../core/mesh-context";
import type { ConnectionEntity } from "../../tools/connection/schema";
import { createLLMProvider } from "../llm-provider";
import { fixProtocol } from "./oauth-proxy";
import { Thread, ThreadMessage } from "@/storage/types";

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

const StreamRequestSchema = z.object({
  additionalContext: z.record(z.string(), z.unknown()).optional(),
  message: z.any(), // Complex type from frontend, keeping as any
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
  maxWindowSize: z.number().optional(),
  thread_id: z.string().optional(),
});

export type StreamRequest = z.infer<typeof StreamRequestSchema>;

const app = new Hono<{ Variables: { meshContext: MeshContext } }>();

function ensureOrganization(ctx: MeshContext, orgSlug: string) {
  if (!ctx.organization) {
    throw new Error("Organization context is required");
  }

  if ((ctx.organization.slug ?? ctx.organization.id) !== orgSlug) {
    throw new Error("Organization mismatch");
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

app.post("/:org/mesh-operator/stream", async (c) => {
  const ctx = c.get("meshContext");
  const orgSlug = c.req.param("org");

  // MCP client will be initialized after validation
  let mcpClient: Client | null = null;

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

    const {
      model: modelConfig,
      gateway: gatewayConfig,
      additionalContext,
      message,
      temperature,
      maxWindowSize = DEFAULT_MEMORY,
      thread_id: threadId,
    } = payload;
    const userId = ctx.auth.user?.id;
    if (!userId) {
      throw new Error("User ID is required");
    }
    let thread: Thread | null = null;
    let threadMessages: ThreadMessage[] = [];
    if (threadId) {
      thread = await ctx.storage.threads.get(threadId);
      if (thread) {
        threadMessages = await ctx.storage.threads.listMessages(threadId);
      }
    }
    const threads = await ctx.storage.threads.listByUserId(userId);
    console.log("threads", threads);
    console.log("threadMessages", threadMessages);

    // Use limits from model config, fallback to default
    const maxOutputTokens =
      modelConfig.limits?.maxOutputTokens ?? DEFAULT_MAX_TOKENS;

    const transport = createGatewayTransport(
      c.req.raw,
      organization.id,
      gatewayConfig.id,
    );

    const client = new Client({ name: "mcp-mesh-proxy", version: "1.0.0" });

    // Convert UIMessages to CoreMessages and create MCP proxy/client in parallel
    const [modelMessages, connection] = await Promise.all([
      convertToModelMessages([...threadMessages, ...message], {
        ignoreIncompleteToolCalls: true,
      }),
      getConnectionById(ctx, organization.id, modelConfig.connectionId),
      client.connect(transport),
    ]);

    if (!connection) {
      return c.json(
        { error: `Model connection not found: ${modelConfig.connectionId}` },
        404,
      );
    }

    mcpClient = client;

    // Extract context from frontend system message and combine with base prompt
    const systemMessages = [
      DECOPILOT_SYSTEM_MESSAGE,
      ...modelMessages.filter((m) => m.role === "system"),
      {
        role: "system",
        content: `
        Additional context: ${JSON.stringify(additionalContext)}
        `,
      } as SystemModelMessage,
    ];

    // Filter out system messages (they go to system param, not messages array)
    const nonSystemMessages = modelMessages.filter((m) => m.role !== "system");

    // Prune messages to reduce context size
    const prunedMessages = pruneMessages({
      messages: nonSystemMessages,
      reasoning: "before-last-message",
      emptyMessages: "remove",
      toolCalls: "none",
    }).slice(-maxWindowSize);

    console.log("prunedMessages", prunedMessages);

    // Build properties for monitoring correlation
    const monitoringProperties = threadId ? { thread_id: threadId } : undefined;

    const [proxy, tools] = await Promise.all([
      ctx.createMCPProxy(connection),
      toolsFromMCP(client, monitoringProperties),
    ]);

    const llmBinding = LanguageModelBinding.forClient(proxy);
    const provider = createLLMProvider(llmBinding).languageModel(
      modelConfig.id,
    );
    const toolset: ToolSet = {
      ...tools,
      listThreads: tool<
        {
          limit: number;
        },
        Thread[]
      >({
        title: "List Threads",
        description: "List all threads",
        inputSchema: jsonSchema(
          z.toJSONSchema(
            z.object({
              limit: z.number().optional(),
            }),
          ) as JSONSchema7,
        ),
        outputSchema: jsonSchema(
          z.toJSONSchema(
            z.array(
              z.object({
                id: z.string(),
                title: z.string(),
                description: z.string().optional(),
                createdAt: z.string(),
                updatedAt: z.string(),
              }),
            ),
          ) as JSONSchema7,
        ),

        execute: async ({ limit }) => {
          const { threads } = await ctx.storage.threads.list(organization.id, {
            limit,
          });
          return threads;
        },
      }),
      listMessages: tool<
        {
          threadId: string;
        },
        ThreadMessage[]
      >({
        title: "List Messages",
        description: "List all messages for a thread",
        inputSchema: jsonSchema(
          z.toJSONSchema(
            z.object({
              threadId: z.string(),
            }),
          ) as JSONSchema7,
        ),
        outputSchema: jsonSchema(
          z.toJSONSchema(
            z.array(
              z.object({
                id: z.string(),
                threadId: z.string(),
                role: z.string(),
                parts: z.array(
                  z.object({
                    type: z.string(),
                    text: z.string().optional(),
                    reasoning: z.string().optional(),
                  }),
                ),
                createdAt: z.string(),
                updatedAt: z.string(),
              }),
            ),
          ) as JSONSchema7,
        ),
        execute: async ({ threadId }) => {
          return await ctx.storage.threads.listMessages(threadId);
        },
      }),
    };

    // Use streamText from AI SDK with pruned messages and parameters
    const result = streamText({
      model: provider,
      system: systemMessages,
      messages: prunedMessages,

      tools: toolset,
      temperature,
      maxOutputTokens: maxOutputTokens,
      abortSignal: c.req.raw.signal,
      stopWhen: stepCountIs(30), // Stop after 30 steps with tool calls
      onError: async (error) => {
        console.error("[models:stream] Error", error);
        await client.close().catch(console.error);
      },
      onFinish: async ({}) => {
        await client.close().catch(console.error);
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
      onFinish: async ({ messages }) => {
        console.log("finished messages", messages);
        console.log("initial message", message);
        if (!thread) {
          const newThread = await ctx.storage.threads.create({
            id: threadId, // Use the ID from the frontend payload
            organizationId: organization.id,
            createdBy: userId,
            title: "New Thread",
            description: "New Thread",
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          thread = newThread;

          if (!thread) throw new Error("Failed to create thread");
        }
        // Create messages sequentially to ensure correct timestamp ordering.
        // Using Promise.all would create messages in parallel with the same
        // timestamp, causing ORDER BY created_at to return them in undefined order.
        const allMessages = [...message, ...messages];
        for (const m of allMessages) {
          await ctx.storage.threads.createMessage({
            threadId: thread!.id,
            role: m.role,
            parts: m.parts as ThreadMessage["parts"],
          });
        }
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

import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { LanguageModelBinding } from "@decocms/bindings/llm";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText,
  tool,
} from "ai";
import { Hono } from "hono";
import { z } from "zod";
import type { MeshContext } from "../../core/mesh-context";
import { ConnectionTools } from "../../tools";
import type { ConnectionEntity } from "../../tools/connection/schema";
import { createLLMProvider } from "../llm-provider";

// Default values
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MEMORY = 50; // last N messages to keep

// System prompt for AI assistant with MCP connections
const BASE_SYSTEM_PROMPT = `You are a helpful AI assistant with access to Model Context Protocol (MCP) connections.

**Your Capabilities:**
- Access to various MCP integrations and their tools
- Ability to discover what tools are available on each connection
- Execute tools from connected services to help users accomplish tasks

**How to Work with Connections:**
1. You have access to a list of available connections (each with an id, name, and description)
2. To see what tools a connection provides, use READ_MCP_TOOLS with the connection id
3. To execute a tool from a connection, use CALL_MCP_TOOL with the connectionId, toolName, and required arguments

**Important Guidelines:**
- Always check what tools are available before attempting to use them
- Read tool schemas carefully to understand required inputs
- Handle errors gracefully and explain issues to users
- Be proactive in discovering and using the right tools for the task

You are here to help users accomplish their goals by intelligently using the available MCP connections and tools.`;

type ConnectionSummary = {
  id: string;
  name: string;
  description: string | null;
};

// Agent tool_set type
type AgentToolSet = Record<string, string[]>;

// Helper to create MCP client for a connection
async function createConnectionClient(connection: ConnectionEntity) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (connection.connection_token) {
    headers.Authorization = `Bearer ${connection.connection_token}`;
  }

  if (connection.connection_headers) {
    Object.assign(headers, connection.connection_headers);
  }

  const transport = new StreamableHTTPClientTransport(
    new URL(connection.connection_url),
    {
      requestInit: {
        headers,
      },
    },
  );

  const client = new Client({
    name: "mcp-mesh-models-stream",
    version: "1.0.0",
  });

  await client.connect(transport);
  return client;
}

// List all active connections for the organization (id, name, description only)
// Optionally filter by agent's tool_set
async function listConnections(
  ctx: MeshContext,
  organizationId: string,
  toolSet?: AgentToolSet,
): Promise<ConnectionSummary[]> {
  const connections = await ctx.storage.connections.list(organizationId);

  let filtered = connections.filter((conn) => conn.status === "active");

  // If tool_set is provided, filter to only include allowed connections
  if (toolSet) {
    const allowedConnectionIds = new Set(Object.keys(toolSet));
    filtered = filtered.filter((conn) => allowedConnectionIds.has(conn.id));
  }

  return filtered.map((conn) => ({
    id: conn.id,
    name: conn.title,
    description: conn.description,
  }));
}

// Format connections for system prompt
function formatAvailableConnections(connections: ConnectionSummary[]): string {
  if (connections.length === 0) {
    return "No connections available.";
  }

  return connections
    .map(
      (conn) =>
        `- ${conn.name} (${conn.id}): ${conn.description || "No description"}`,
    )
    .join("\n");
}

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
  agent: z
    .object({
      id: z.string(),
      instructions: z.string(),
      tool_set: z.record(z.string(), z.array(z.string())),
      avatar: z.string().optional(),
      name: z.string().optional(),
    })
    .passthrough()
    .optional(),
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

// Create AI SDK tools for connection management
// Optionally filter by agent's tool_set
function createConnectionTools(ctx: MeshContext, toolSet?: AgentToolSet) {
  return {
    READ_MCP_TOOLS: tool({
      description:
        "Get detailed information about a specific MCP connection, including all available tools with their schemas",
      inputSchema: z.object({
        id: z.string().describe("The connection ID"),
      }),
      execute: async ({ id }) => {
        // If tool_set is provided, check if connection is allowed
        if (toolSet && !toolSet[id]) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `Connection ${id} is not available for this agent`,
              },
            ],
          };
        }

        try {
          const result =
            await ConnectionTools.COLLECTION_CONNECTIONS_GET.execute(
              { id },
              ctx,
            );

          // If tool_set is provided, filter the tools returned
          if (toolSet && result.item?.tools) {
            const allowedTools = new Set(toolSet[id] || []);
            // If allowedTools is empty array, allow all tools for this connection
            if (allowedTools.size > 0) {
              result.item.tools = result.item.tools.filter((t) =>
                allowedTools.has(t.name),
              );
            }
          }

          return result;
        } catch (error) {
          console.error(`Error getting connection ${id}:`, error);
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: error instanceof Error ? error.message : "Unknown error",
              },
            ],
          };
        }
      },
    }),

    CALL_MCP_TOOL: tool({
      description:
        "Call a tool from a specific MCP connection. Use READ_MCP_TOOLS first to see available tools and their schemas.",
      inputSchema: z.object({
        connectionId: z
          .string()
          .describe("The connection ID to call the tool on"),
        toolName: z.string().describe("The name of the tool to call"),
        arguments: z
          .record(z.string(), z.any())
          .describe("Arguments to pass to the tool"),
      }),
      execute: async ({ connectionId, toolName, arguments: args }) => {
        // If tool_set is provided, validate the call
        if (toolSet) {
          const allowedTools = toolSet[connectionId];
          if (!allowedTools) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Connection ${connectionId} is not available for this agent`,
                },
              ],
            };
          }

          // If allowedTools array is not empty, check if tool is allowed
          if (allowedTools.length > 0 && !allowedTools.includes(toolName)) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Tool ${toolName} is not available for this agent on connection ${connectionId}`,
                },
              ],
            };
          }
        }

        // Get connection using existing tool
        const connection = await ctx.storage.connections.findById(connectionId);

        if (!connection) {
          throw new Error(`Connection not found: ${connectionId}`);
        }

        if (
          !ctx.organization ||
          connection.organization_id !== ctx.organization.id
        ) {
          throw new Error(
            "Connection does not belong to the current organization",
          );
        }

        if (connection.status !== "active") {
          throw new Error(`Connection is ${connection.status}, not active`);
        }

        // Create MCP client and call tool (reusing helper)
        let client: Client | null = null;
        try {
          client = await createConnectionClient(connection);
          const result = await client.callTool({
            name: toolName,
            arguments: args,
          });

          return {
            isError: result.isError || false,
            content: result.content,
          };
        } catch (e) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: e instanceof Error ? e.message : "Unknown error",
              },
            ],
          };
        } finally {
          try {
            if (client && typeof client.close === "function") {
              await client.close();
            }
          } catch {
            // Ignore close errors
          }
        }
      },
    }),
  };
}

// Build system prompt, optionally including agent instructions
function buildSystemPrompt(
  connections: ConnectionSummary[],
  agentInstructions?: string,
): string {
  const parts: string[] = [];

  // Add agent instructions first if provided
  if (agentInstructions) {
    parts.push(agentInstructions);
    parts.push(""); // Empty line separator
  }

  // Add base system prompt
  parts.push(BASE_SYSTEM_PROMPT);

  // Add available connections
  parts.push(
    `\nAvailable MCP Connections:\n${formatAvailableConnections(connections)}`,
  );

  return parts.join("\n");
}

app.post("/:org/models/stream", async (c) => {
  const ctx = c.get("meshContext");
  const orgSlug = c.req.param("org");

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
      agent: agentConfig,
      messages,
      temperature,
      maxOutputTokens = DEFAULT_MAX_TOKENS,
      maxWindowSize = DEFAULT_MEMORY,
      thread_id: threadId,
    } = payload;

    // Get the model provider connection
    const connection = await getConnectionById(
      ctx,
      organization.id,
      modelConfig.connectionId,
    );

    if (!connection) {
      return c.json(
        { error: `Model connection not found: ${modelConfig.connectionId}` },
        404,
      );
    }

    // Get agent's tool_set if agent is provided
    const toolSet = agentConfig?.tool_set;

    // List connections (filtered by agent's tool_set if provided)
    const connections = await listConnections(ctx, organization.id, toolSet);

    // Convert UIMessages to CoreMessages using AI SDK helper
    const modelMessages = convertToModelMessages(messages);

    // Prune messages to reduce context size
    const prunedMessages = pruneMessages({
      messages: modelMessages,
      reasoning: "before-last-message",
      emptyMessages: "remove",
      toolCalls: "none",
    }).slice(-maxWindowSize);

    // Create provider using the LanguageModelBinding
    const proxy = await ctx.createMCPProxy(connection);
    const llmBinding = LanguageModelBinding.forClient(proxy);
    const provider = createLLMProvider(llmBinding).languageModel(
      modelConfig.id,
    );
    // Build system prompt with available connections and optional agent instructions
    const systemPrompt = buildSystemPrompt(
      connections,
      agentConfig?.instructions,
    );

    // Create connection tools with MeshContext (filtered by agent's tool_set if provided)
    const connectionTools = createConnectionTools(ctx, toolSet);

    // Use streamText from AI SDK with pruned messages and parameters
    const result = streamText({
      model: provider,
      messages: prunedMessages,
      system: systemPrompt,
      tools: connectionTools,
      temperature,
      maxOutputTokens,
      abortSignal: c.req.raw.signal,
      stopWhen: stepCountIs(30), // Stop after 30 steps with tool calls
      onError: (error) => {
        console.error("[models:stream] Error", error);
      },
      onAbort: (error) => {
        console.error("[models:stream] Abort", error);
      },
    });

    // Return the stream using toUIMessageStreamResponse
    return result.toUIMessageStreamResponse({
      messageMetadata: ({ part }): Metadata => {
        if (part.type === "start") {
          return {
            agent: agentConfig,
            model: modelConfig,
            created_at: new Date(),
            thread_id: threadId,
          };
        }
        return {};
      },
    });
  } catch (error) {
    const err = error as Error;
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

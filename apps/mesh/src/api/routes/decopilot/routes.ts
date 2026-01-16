/**
 * Decopilot Routes
 *
 * HTTP handlers for the Decopilot AI assistant.
 * Uses the Agent, Memory, and ModelProvider abstractions.
 */

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
  generateText,
  jsonSchema,
  JSONSchema7,
  JSONValue,
  pruneMessages,
  stepCountIs,
  streamText,
  SystemModelMessage,
  tool,
  ToolSet,
  UIMessage,
} from "ai";
import { Context, Hono } from "hono";
import { z } from "zod";

import type { MeshContext, OrganizationScope } from "@/core/mesh-context";
import type { ConnectionEntity } from "@/tools/connection/schema";
import {
  generatePrefixedId,
  idMatchesPrefix,
} from "@/shared/utils/generate-id";
import type { ThreadMessage } from "@/storage/types";
import { createLLMProvider } from "../../llm-provider";
import { fixProtocol } from "../oauth-proxy";

import type { Agent, Memory, ModelProvider } from "./types";
import { createAgent as createAgentImpl } from "./agent";
import { createMemory } from "./memory";

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_TOKENS = 32768;
const DEFAULT_WINDOW_SIZE = 50;

/**
 * Base system prompt for Decopilot
 */
const DECOPILOT_BASE_PROMPT = `You are an AI assistant running in an MCP Mesh environment.

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
- When users mention "agents", they are typically referring to gateways`;

const TITLE_GENERATOR_PROMPT = `Your task: Generate a short title (3-6 words) summarizing the user's request.

Rules:
- Output ONLY the title, nothing else
- No quotes, no punctuation at the end
- No explanations, no "Title:" prefix
- Just the raw title text

Example input: "How do I connect to a database?"
Example output: Database Connection Setup

Example input: "What tools are available?"
Example output: Available Tools Overview`;

// ============================================================================
// Title Generation (runs in parallel with main agent)
// ============================================================================

/**
 * Generate a short title for the conversation in the background.
 * Writes to the stream writer when complete.
 */
async function generateTitleInBackground(config: {
  model: ModelProvider["model"];
  userMessage: string;
  onTitle?: (title: string) => void;
}): Promise<void> {
  const { model, userMessage, onTitle } = config;

  try {
    const result = await generateText({
      model,
      system: TITLE_GENERATOR_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      maxOutputTokens: 30,
      temperature: 0.2,
    });

    // Extract just the first line, clean up any formatting
    const rawTitle = result.text.trim();
    const firstLine = rawTitle.split("\n")[0] ?? rawTitle;
    const title = firstLine
      .replace(/^["']|["']$/g, "") // Remove quotes
      .replace(/^(Title:|title:)\s*/i, "") // Remove "Title:" prefix
      .replace(/[.!?]$/, "") // Remove trailing punctuation
      .slice(0, 60) // Max 60 chars
      .trim();

    console.log("[decopilot:title] ✅ Title generated:", title);
    onTitle?.(title);
  } catch (error) {
    const err = error as Error;
    console.error(
      "[decopilot:title] ❌ Failed to generate title:",
      err.message,
    );
  }
}

// ============================================================================
// Request Schemas
// ============================================================================

const UIMessageSchema = z.looseObject({
  id: z.string().optional(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(z.record(z.string(), z.unknown())),
  metadata: z.unknown().optional(),
});

const MemoryConfigSchema = z.object({
  windowSize: z.number().optional(),
  threadId: z.string(),
});

const StreamRequestSchema = z.object({
  messages: z.array(UIMessageSchema).describe("User messages"),
  memory: MemoryConfigSchema.optional(),
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

// ============================================================================
// Helper Functions
// ============================================================================

function ensureOrganization(
  c: Context<{ Variables: { meshContext: MeshContext } }>,
): OrganizationScope {
  const organization = c.get("meshContext").organization;
  if (!organization) {
    throw new Error("Organization context is required");
  }
  if ((organization.slug ?? organization.id) !== c.req.param("org")) {
    throw new Error("Organization mismatch");
  }
  return organization;
}

function ensureUser(ctx: MeshContext): string {
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
  if (!connection) return null;
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
 * Convert MCP tools to AI SDK ToolSet
 */
async function toolsFromMCP(
  client: Client,
  properties?: Record<string, string>,
): Promise<ToolSet> {
  const list = await client.listTools();

  console.log({
    tools: list.tools.map((t) => ({
      name: t.name,
      description: t.description,
    })),
  });

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
}

function createGatewayTransport(
  req: Request,
  organizationId: string,
  gatewayId: string | null | undefined,
): StreamableHTTPClientTransport {
  const url = fixProtocol(new URL(req.url));
  const baseUrl = `${url.protocol}//${url.host}`;

  const headers = new Headers([["x-org-id", organizationId]]);
  for (const header of ["cookie", "authorization"]) {
    if (req.headers.has(header)) {
      headers.set(header, req.headers.get(header)!);
    }
  }

  const gatewayPath = gatewayId ? `/mcp/gateway/${gatewayId}` : "/mcp/gateway";
  const gatewayUrl = new URL(gatewayPath, baseUrl);
  gatewayUrl.searchParams.set("mode", "code_execution");

  return new StreamableHTTPClientTransport(gatewayUrl, {
    requestInit: { headers },
  });
}

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
  console.log("[decopilot:agent] 🚀 Creating agent...", {
    organizationId: config.organizationId,
    threadId: config.threadId,
  });

  const client = new Client({ name: "mcp-mesh-proxy", version: "1.0.0" });
  await client.connect(config.transport);
  console.log("[decopilot:agent] ✅ Connected to gateway");

  const tools = await toolsFromMCP(client, config.monitoringProperties);
  const toolNames = Object.keys(tools);
  console.log("[decopilot:agent] 🔧 Tools loaded:", {
    count: toolNames.length,
    tools: toolNames.slice(0, 10), // Show first 10
    hasMore: toolNames.length > 10,
  });

  const agent = createAgentImpl({
    organizationId: config.organizationId,
    client,
    tools,
    systemPrompts: [DECOPILOT_BASE_PROMPT],
  });

  return agent;
}

// ============================================================================
// Model Provider Creation
// ============================================================================

/**
 * Create a ModelProvider from a connection
 */
async function createModelProvider(
  ctx: MeshContext,
  config: { organizationId: string; modelId: string; connectionId: string },
): Promise<ModelProvider> {
  const connection = await getConnectionById(
    ctx,
    config.organizationId,
    config.connectionId,
  );
  if (!connection) {
    throw new Error(`Connection not found: ${config.connectionId}`);
  }

  const proxy = await ctx.createMCPProxy(connection);
  const llmBinding = LanguageModelBinding.forClient(proxy);
  const model = createLLMProvider(llmBinding).languageModel(config.modelId);

  return {
    model,
    modelId: config.modelId,
    connectionId: config.connectionId,
  };
}

// ============================================================================
// Message Processing
// ============================================================================

interface ProcessedConversation {
  memory: Memory;
  systemMessages: SystemModelMessage[];
  prunedMessages: ReturnType<typeof pruneMessages>;
  userMessages: UIMessage<Metadata>[];
  userCreatedAt: string;
}

/**
 * Process messages and create/load memory for the conversation
 */
async function processConversation(
  ctx: MeshContext,
  agent: Agent,
  config: {
    organizationId: string;
    threadId: string | null | undefined;
    windowSize: number;
    messages: UIMessage<Metadata>[];
  },
): Promise<ProcessedConversation> {
  console.log("[decopilot:conversation] 📝 Processing conversation...", {
    threadId: config.threadId,
    windowSize: config.windowSize,
    incomingMessages: config.messages.length,
  });

  const userId = ensureUser(ctx);

  // Create or load memory
  const memory = await createMemory(ctx.storage.threads, {
    organizationId: config.organizationId,
    threadId: config.threadId,
    userId,
    defaultWindowSize: config.windowSize,
  });

  // Load thread history
  const threadMessages = await memory.loadHistory();

  // Convert to model messages
  const modelMessages = await convertToModelMessages(
    [...threadMessages, ...config.messages],
    { ignoreIncompleteToolCalls: true },
  );

  const userCreatedAt = new Date().toISOString();

  // Extract user messages
  const userMessages = config.messages.filter(
    (m) => m.role === "user",
  ) as unknown as UIMessage<Metadata>[];

  // Build system messages from agent prompts + incoming system messages
  const systemMessages: SystemModelMessage[] = [
    ...agent.systemPrompts.map((content) => ({
      role: "system" as const,
      content,
    })),
    ...(modelMessages.filter(
      (m) => m.role === "system",
    ) as SystemModelMessage[]),
  ];

  // Filter and prune non-system messages
  const nonSystemMessages = modelMessages.filter((m) => m.role !== "system");
  const prunedMessages = pruneMessages({
    messages: nonSystemMessages,
    reasoning: "before-last-message",
    emptyMessages: "remove",
    toolCalls: "none",
  }).slice(-config.windowSize);

  console.log("[decopilot:conversation] ✅ Conversation processed", {
    threadId: memory.thread.id,
    historyLoaded: threadMessages.length,
    systemPrompts: systemMessages.length,
    prunedMessages: prunedMessages.length,
    userMessages: userMessages.length,
  });

  return {
    memory,
    systemMessages,
    prunedMessages,
    userMessages,
    userCreatedAt,
  };
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

    console.log("[decopilot:stream] 🎯 Starting LLM stream", {
      model: modelProvider.modelId,
      connection: modelProvider.connectionId,
      temperature,
      maxOutputTokens,
      toolCount: Object.keys(agent.tools).length,
      systemPromptCount: systemMessages.length,
      messageCount: prunedMessages.length,
      generatingTitle: shouldGenerateTitle,
    });

    console.log({
      systemMessages: systemMessages.map((m) => m.content).join("\n"),
    });

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

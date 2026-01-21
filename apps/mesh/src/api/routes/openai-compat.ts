/**
 * OpenAI-Compatible API Routes
 *
 * Provides an OpenAI-compatible /v1/chat/completions endpoint for organization-scoped
 * LLM access. Supports full OpenAI spec including tools/function calling.
 *
 * Authentication: Bearer token (API key) with organization metadata
 * Authorization: Checks permission on the model connection
 * Model format: "connection_id:model_id"
 */

import { LanguageModelBinding } from "@decocms/bindings/llm";
import {
  generateText,
  jsonSchema,
  streamText,
  tool,
  type JSONSchema7,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { AccessControl } from "../../core/access-control";
import type { MeshContext } from "../../core/mesh-context";
import type { ConnectionEntity } from "../../tools/connection/schema";
import { createLLMProvider } from "../llm-provider";

// ============================================================================
// Types & Schemas
// ============================================================================

/**
 * OpenAI-compatible tool definition
 */
const OpenAIToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  }),
});

/**
 * OpenAI-compatible tool call
 */
const OpenAIToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
});

/**
 * OpenAI-compatible message
 */
const OpenAIMessageSchema = z.discriminatedUnion("role", [
  // System message
  z.object({
    role: z.literal("system"),
    content: z.string(),
    name: z.string().optional(),
  }),
  // User message
  z.object({
    role: z.literal("user"),
    content: z.union([
      z.string(),
      z.array(
        z.union([
          z.object({ type: z.literal("text"), text: z.string() }),
          z.object({
            type: z.literal("image_url"),
            image_url: z.object({
              url: z.string(),
              detail: z.string().optional(),
            }),
          }),
        ]),
      ),
    ]),
    name: z.string().optional(),
  }),
  // Assistant message
  z.object({
    role: z.literal("assistant"),
    content: z.string().nullable().optional(),
    name: z.string().optional(),
    tool_calls: z.array(OpenAIToolCallSchema).optional(),
  }),
  // Tool result message
  z.object({
    role: z.literal("tool"),
    content: z.string(),
    tool_call_id: z.string(),
  }),
]);

type OpenAIMessage = z.infer<typeof OpenAIMessageSchema>;
type OpenAITool = z.infer<typeof OpenAIToolSchema>;

/**
 * OpenAI-compatible response format schemas
 */
const ResponseFormatTextSchema = z.object({
  type: z.literal("text"),
});

const ResponseFormatJsonObjectSchema = z.object({
  type: z.literal("json_object"),
});

const ResponseFormatJsonSchemaSchema = z.object({
  type: z.literal("json_schema"),
  json_schema: z.object({
    name: z.string(),
    description: z.string().optional(),
    schema: z.record(z.string(), z.unknown()),
    strict: z.boolean().optional(),
  }),
});

const ResponseFormatSchema = z.union([
  ResponseFormatTextSchema,
  ResponseFormatJsonObjectSchema,
  ResponseFormatJsonSchemaSchema,
]);

type ResponseFormat = z.infer<typeof ResponseFormatSchema>;

/**
 * OpenAI-compatible chat completion request
 */
const ChatCompletionRequestSchema = z.object({
  model: z.string().describe("Format: connection_id:model_id"),
  messages: z.array(OpenAIMessageSchema),
  stream: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().positive().optional(),
  top_p: z.number().min(0).max(1).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  tools: z.array(OpenAIToolSchema).optional(),
  tool_choice: z
    .union([
      z.literal("auto"),
      z.literal("none"),
      z.literal("required"),
      z.object({
        type: z.literal("function"),
        function: z.object({ name: z.string() }),
      }),
    ])
    .optional(),
  response_format: ResponseFormatSchema.optional(),
  user: z.string().optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create OpenAI-compatible error response
 */
function createErrorResponse(
  message: string,
  type: string = "invalid_request_error",
  param: string | null = null,
  code: string | null = null,
) {
  return {
    error: {
      message,
      type,
      param,
      code,
    },
  };
}

/**
 * Parse model string into connectionId and modelId
 * Format: "connection_id:model_id"
 */
function parseModelString(
  model: string,
): { connectionId: string; modelId: string } | null {
  const colonIndex = model.indexOf(":");
  if (colonIndex === -1) {
    return null;
  }

  const connectionId = model.substring(0, colonIndex);
  const modelId = model.substring(colonIndex + 1);

  if (!connectionId || !modelId) {
    return null;
  }

  return { connectionId, modelId };
}

/**
 * Custom error for message conversion validation failures
 */
class MessageConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageConversionError";
  }
}

/**
 * Safely parse JSON with a descriptive error message
 */
function safeParseToolArguments(
  args: string,
  toolCallId: string,
  functionName: string,
): unknown {
  try {
    return JSON.parse(args);
  } catch {
    throw new MessageConversionError(
      `Invalid JSON in tool call arguments for function '${functionName}' (tool_call_id: ${toolCallId}): ${args}`,
    );
  }
}

/**
 * Convert OpenAI messages to AI SDK message format
 * Returns a format compatible with streamText/generateText
 * @throws {MessageConversionError} if tool call arguments contain invalid JSON
 */
function convertToAISDKMessages(messages: OpenAIMessage[]): ModelMessage[] {
  return messages.map((msg): ModelMessage => {
    switch (msg.role) {
      case "system":
        return { role: "system", content: msg.content };

      case "user":
        if (typeof msg.content === "string") {
          return { role: "user", content: msg.content };
        }
        // Handle multi-part content (text + images)
        return {
          role: "user",
          content: msg.content.map((part) => {
            if (part.type === "text") {
              return { type: "text" as const, text: part.text };
            }
            return { type: "image" as const, image: part.image_url.url };
          }),
        };

      case "assistant":
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          // AI SDK expects tool-call parts with specific structure
          return {
            role: "assistant",
            content: msg.tool_calls.map((tc) => ({
              type: "tool-call" as const,
              toolCallId: tc.id,
              toolName: tc.function.name,
              args: safeParseToolArguments(
                tc.function.arguments,
                tc.id,
                tc.function.name,
              ),
            })) as unknown as ModelMessage["content"],
          } as ModelMessage;
        }
        return { role: "assistant", content: msg.content ?? "" };

      case "tool":
        // AI SDK expects tool-result parts
        return {
          role: "tool",
          content: [
            {
              type: "tool-result" as const,
              toolCallId: msg.tool_call_id,
              toolName: "",
              content: msg.content,
            },
          ],
        } as unknown as ModelMessage;
    }
  });
}

/**
 * Convert OpenAI tools to AI SDK ToolSet
 * These are "static" tools that just define the schema - no execute function
 * The model will generate tool calls that can be returned to the client
 */
function convertToAISDKTools(openaiTools: OpenAITool[]): ToolSet {
  const toolEntries = openaiTools.map((t) => {
    const schema = t.function.parameters
      ? jsonSchema(t.function.parameters as JSONSchema7)
      : jsonSchema({ type: "object", properties: {} } as JSONSchema7);

    // Create tool with schema - type assertion needed due to complex AI SDK types
    return [
      t.function.name,
      tool({
        description: t.function.description,
        inputSchema: schema as Parameters<typeof tool>[0]["inputSchema"],
      }),
    ];
  });

  return Object.fromEntries(toolEntries);
}

/**
 * Convert OpenAI response_format to AI SDK providerOptions
 * This passes through the response format to OpenAI-compatible providers
 */
function convertResponseFormat(
  responseFormat: ResponseFormat | undefined,
): Record<string, unknown> | undefined {
  if (!responseFormat) {
    return undefined;
  }

  // Pass through the OpenAI response_format to the provider
  // This works for OpenAI and OpenAI-compatible providers
  return {
    openai: {
      response_format: responseFormat,
    },
  };
}

/**
 * Generate a unique completion ID
 */
function generateCompletionId(): string {
  return `chatcmpl-${crypto.randomUUID().replace(/-/g, "").substring(0, 29)}`;
}

/**
 * Get connection by ID with organization validation
 */
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
    return null;
  }

  if (connection.status !== "active") {
    return null;
  }

  return connection;
}

/**
 * Check if user has permission on the connection
 */
async function checkConnectionPermission(
  ctx: MeshContext,
  connectionId: string,
): Promise<void> {
  const accessControl = new AccessControl(
    ctx.authInstance,
    ctx.auth.user?.id ?? ctx.auth.apiKey?.userId,
    "*", // Check for any tool access
    ctx.boundAuth,
    ctx.auth.user?.role,
    connectionId,
  );

  await accessControl.check("*");
}

// ============================================================================
// Route Handler
// ============================================================================

const app = new Hono<{ Variables: { meshContext: MeshContext } }>();

app.post("/:org/v1/chat/completions", async (c) => {
  const ctx = c.get("meshContext");
  const orgSlug = c.req.param("org");

  try {
    // 1. Validate API key authentication (this endpoint only supports API keys, not user sessions)
    if (!ctx.auth.apiKey?.id) {
      return c.json(
        createErrorResponse(
          "API key authentication required. Provide a valid API key via Authorization header.",
          "authentication_error",
        ),
        401,
      );
    }

    // 2. Validate organization context
    if (!ctx.organization) {
      return c.json(
        createErrorResponse(
          "Organization context is required. Ensure your API key has organization metadata.",
          "invalid_request_error",
          "organization",
        ),
        400,
      );
    }

    if ((ctx.organization.slug ?? ctx.organization.id) !== orgSlug) {
      return c.json(
        createErrorResponse(
          "Organization mismatch. The API key's organization does not match the requested organization.",
          "invalid_request_error",
          "organization",
        ),
        403,
      );
    }

    // 3. Parse and validate request body
    const rawBody = await c.req.json();
    const parseResult = ChatCompletionRequestSchema.safeParse(rawBody);

    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0] ?? {
        message: "Invalid request",
        path: [],
      };
      return c.json(
        createErrorResponse(
          `Invalid request: ${firstError.message}`,
          "invalid_request_error",
          firstError.path.length > 0 ? firstError.path.join(".") : null,
        ),
        400,
      );
    }

    const request = parseResult.data;

    // 4. Parse model string
    const modelParsed = parseModelString(request.model);
    if (!modelParsed) {
      return c.json(
        createErrorResponse(
          "Invalid model format. Expected 'connection_id:model_id' (e.g., 'conn_abc123:gpt-4')",
          "invalid_request_error",
          "model",
        ),
        400,
      );
    }

    const { connectionId, modelId } = modelParsed;

    // 5. Check connection permission
    try {
      await checkConnectionPermission(ctx, connectionId);
    } catch {
      return c.json(
        createErrorResponse(
          `Access denied to connection: ${connectionId}`,
          "permission_error",
          "model",
        ),
        403,
      );
    }

    // 6. Get connection
    const connection = await getConnectionById(
      ctx,
      ctx.organization.id,
      connectionId,
    );
    if (!connection) {
      return c.json(
        createErrorResponse(
          `Connection not found or inactive: ${connectionId}`,
          "invalid_request_error",
          "model",
        ),
        404,
      );
    }

    // 7. Create LLM provider
    const proxy = await ctx.createMCPProxy(connection);
    const llmBinding = LanguageModelBinding.forClient(proxy);
    const provider = createLLMProvider(llmBinding).languageModel(modelId);

    // 8. Convert messages, tools, and response format
    const messages = convertToAISDKMessages(request.messages);
    const tools = request.tools
      ? convertToAISDKTools(request.tools)
      : undefined;
    const providerOptions = convertResponseFormat(request.response_format);

    // 9. Prepare common options
    const completionId = generateCompletionId();
    const created = Math.floor(Date.now() / 1000);

    // Base options without providerOptions
    const baseOptions = {
      model: provider,
      messages,
      tools,
      temperature: request.temperature,
      maxTokens: request.max_tokens,
      topP: request.top_p,
      frequencyPenalty: request.frequency_penalty,
      presencePenalty: request.presence_penalty,
      stopSequences: request.stop
        ? Array.isArray(request.stop)
          ? request.stop
          : [request.stop]
        : undefined,
      abortSignal: c.req.raw.signal,
    };

    // Add providerOptions for response_format if specified
    const commonOptions = providerOptions
      ? { ...baseOptions, providerOptions }
      : baseOptions;

    // 10. Handle streaming vs non-streaming
    if (request.stream) {
      return streamSSE(c, async (stream) => {
        try {
          // Type assertion needed due to AI SDK type complexity
          const result = streamText(
            commonOptions as Parameters<typeof streamText>[0],
          );

          let sentRole = false;
          let toolCallIndex = 0;
          const toolCallIds: Record<string, { index: number; name: string }> =
            {};

          for await (const part of result.fullStream) {
            // Send initial role delta
            if (
              !sentRole &&
              (part.type === "text-delta" || part.type === "tool-call")
            ) {
              await stream.writeSSE({
                data: JSON.stringify({
                  id: completionId,
                  object: "chat.completion.chunk",
                  created,
                  model: request.model,
                  choices: [
                    {
                      index: 0,
                      delta: { role: "assistant", content: "" },
                      finish_reason: null,
                    },
                  ],
                }),
              });
              sentRole = true;
            }

            if (part.type === "text-delta") {
              await stream.writeSSE({
                data: JSON.stringify({
                  id: completionId,
                  object: "chat.completion.chunk",
                  created,
                  model: request.model,
                  choices: [
                    {
                      index: 0,
                      delta: { content: part.text },
                      finish_reason: null,
                    },
                  ],
                }),
              });
            } else if (part.type === "tool-call") {
              // Tool call start
              const idx = toolCallIndex++;
              toolCallIds[part.toolCallId] = {
                index: idx,
                name: part.toolName,
              };

              await stream.writeSSE({
                data: JSON.stringify({
                  id: completionId,
                  object: "chat.completion.chunk",
                  created,
                  model: request.model,
                  choices: [
                    {
                      index: 0,
                      delta: {
                        tool_calls: [
                          {
                            index: idx,
                            id: part.toolCallId,
                            type: "function",
                            function: {
                              name: part.toolName,
                              arguments: JSON.stringify(part.input),
                            },
                          },
                        ],
                      },
                      finish_reason: null,
                    },
                  ],
                }),
              });
            } else if (part.type === "finish") {
              const finishReason =
                part.finishReason === "tool-calls"
                  ? "tool_calls"
                  : part.finishReason === "stop"
                    ? "stop"
                    : part.finishReason === "length"
                      ? "length"
                      : "stop";

              await stream.writeSSE({
                data: JSON.stringify({
                  id: completionId,
                  object: "chat.completion.chunk",
                  created,
                  model: request.model,
                  choices: [
                    {
                      index: 0,
                      delta: {},
                      finish_reason: finishReason,
                    },
                  ],
                  usage: part.totalUsage
                    ? {
                        prompt_tokens: part.totalUsage.inputTokens ?? 0,
                        completion_tokens: part.totalUsage.outputTokens ?? 0,
                        total_tokens: part.totalUsage.totalTokens ?? 0,
                      }
                    : undefined,
                }),
              });
            }
          }

          await stream.writeSSE({ data: "[DONE]" });
        } catch (error) {
          const err = error as Error;
          console.error("[openai-compat:stream] Error:", err.message);
          await stream.writeSSE({
            data: JSON.stringify({
              error: {
                message: err.message,
                type: "server_error",
              },
            }),
          });
        }
      });
    } else {
      // Non-streaming response
      // Type assertion needed due to AI SDK type complexity
      const result = await generateText(
        commonOptions as Parameters<typeof generateText>[0],
      );

      // Build response message
      const responseMessage: {
        role: "assistant";
        content: string | null;
        tool_calls?: Array<{
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }>;
      } = {
        role: "assistant",
        content: result.text || null,
      };

      // Add tool calls if present
      if (result.toolCalls && result.toolCalls.length > 0) {
        responseMessage.tool_calls = result.toolCalls.map((tc) => ({
          id: tc.toolCallId,
          type: "function" as const,
          function: {
            name: tc.toolName,
            // toolCalls can have different shapes, use 'input' for the args
            arguments: JSON.stringify("input" in tc ? tc.input : {}),
          },
        }));
        responseMessage.content = null;
      }

      const finishReason =
        result.finishReason === "tool-calls"
          ? "tool_calls"
          : result.finishReason === "stop"
            ? "stop"
            : result.finishReason === "length"
              ? "length"
              : "stop";

      return c.json({
        id: completionId,
        object: "chat.completion",
        created,
        model: request.model,
        choices: [
          {
            index: 0,
            message: responseMessage,
            finish_reason: finishReason,
          },
        ],
        usage: {
          prompt_tokens: result.usage?.inputTokens ?? 0,
          completion_tokens: result.usage?.outputTokens ?? 0,
          total_tokens: result.usage?.totalTokens ?? 0,
        },
      });
    }
  } catch (error) {
    const err = error as Error;

    if (err.name === "AbortError") {
      return c.json(
        createErrorResponse("Request aborted", "invalid_request_error"),
        400,
      );
    }

    // Handle message conversion validation errors (e.g., malformed JSON in tool call arguments)
    if (err.name === "MessageConversionError") {
      return c.json(
        createErrorResponse(err.message, "invalid_request_error", "messages"),
        400,
      );
    }

    console.error("[openai-compat] Error:", err.message, err.stack);
    return c.json(createErrorResponse(err.message, "server_error"), 500);
  }
});

export default app;

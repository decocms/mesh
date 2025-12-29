/**
 * OpenRouter LLM Client
 *
 * Uses AI SDK v6 with OpenRouter provider for benchmarking.
 */

// Suppress AI SDK warnings about compatibility mode
declare global {
  // oxlint-disable-next-line no-var
  var AI_SDK_LOG_WARNINGS: false | LogWarningsFunction;
}
globalThis.AI_SDK_LOG_WARNINGS = false;

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, jsonSchema, LogWarningsFunction } from "ai";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { LLMResponse } from "../types";

// Message type for the chat
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Create an OpenRouter client
 */
export function createLLMClient(apiKey: string) {
  const openrouter = createOpenRouter({
    apiKey,
    // Request usage statistics from OpenRouter
    headers: {
      "X-Title": "MCP Gateway Benchmark",
    },
  });

  return {
    /**
     * Generate a response with tool calling
     */
    async chat(
      model: string,
      messages: Message[],
      tools: Tool[],
    ): Promise<LLMResponse> {
      // Convert MCP tools to AI SDK tools format
      // AI SDK v6 requires inputSchema wrapped with jsonSchema()
      const aiTools: Record<
        string,
        { description: string; inputSchema: ReturnType<typeof jsonSchema> }
      > = {};

      for (const tool of tools) {
        // Ensure inputSchema has type: "object" (required by OpenAI)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const schema = (tool.inputSchema || {
          type: "object",
          properties: {},
        }) as any;
        if (!schema.type) {
          schema.type = "object";
        }

        aiTools[tool.name] = {
          description: tool.description || "",
          // Wrap with jsonSchema() for AI SDK v6
          inputSchema: jsonSchema(schema),
        };
      }

      let result;
      try {
        result = await generateText({
          model: openrouter(model),
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          tools: aiTools as Parameters<typeof generateText>[0]["tools"],
          maxSteps: 1, // We handle the loop ourselves
        } as Parameters<typeof generateText>[0]);
      } catch (error) {
        // Provide more context on the error
        const err = error as Error & { cause?: unknown; data?: unknown };
        const details = err.cause
          ? ` (cause: ${JSON.stringify(err.cause)})`
          : "";
        const data = err.data ? ` (data: ${JSON.stringify(err.data)})` : "";
        throw new Error(`LLM API error: ${err.message}${details}${data}`);
      }

      // Extract tool calls from the result
      const toolCalls: Array<{ name: string; args: Record<string, unknown> }> =
        [];

      // Check for tool calls in the steps
      const resultWithSteps = result as {
        steps?: Array<{
          toolCalls?: Array<{
            toolName: string;
            args?: Record<string, unknown>;
            input?: Record<string, unknown>;
          }>;
        }>;
      };
      if (resultWithSteps.steps && resultWithSteps.steps.length > 0) {
        for (const step of resultWithSteps.steps) {
          if (step.toolCalls) {
            for (const toolCall of step.toolCalls) {
              toolCalls.push({
                name: toolCall.toolName,
                // AI SDK may use 'args' or 'input' depending on version
                args: (toolCall.args ?? toolCall.input ?? {}) as Record<
                  string,
                  unknown
                >,
              });
            }
          }
        }
      }

      // Also check toolCalls directly on result
      const resultWithToolCalls = result as {
        toolCalls?: Array<{
          toolName: string;
          args?: Record<string, unknown>;
          input?: Record<string, unknown>;
        }>;
      };
      if (
        resultWithToolCalls.toolCalls &&
        resultWithToolCalls.toolCalls.length > 0
      ) {
        for (const toolCall of resultWithToolCalls.toolCalls) {
          // Include all tool calls - the same tool may be called multiple times
          // with different arguments (e.g., in chained scenarios)
          toolCalls.push({
            name: toolCall.toolName,
            args: (toolCall.args ?? toolCall.input ?? {}) as Record<
              string,
              unknown
            >,
          });
        }
      }

      // Get usage from result - AI SDK uses inputTokens/outputTokens
      const usage = result.usage as
        | {
            inputTokens?: number;
            outputTokens?: number;
            totalTokens?: number;
            // Also check legacy format
            promptTokens?: number;
            completionTokens?: number;
          }
        | undefined;

      return {
        text: result.text || "",
        toolCalls,
        usage: {
          inputTokens: usage?.inputTokens ?? usage?.promptTokens ?? 0,
          outputTokens: usage?.outputTokens ?? usage?.completionTokens ?? 0,
        },
      };
    },
  };
}

/**
 * Type for the LLM client
 */
export type LLMClient = ReturnType<typeof createLLMClient>;

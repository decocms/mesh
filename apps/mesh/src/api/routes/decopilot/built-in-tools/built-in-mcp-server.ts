import { createSdkMcpServer, tool } from "ai-sdk-provider-claude-code";
import { z } from "zod";
import type { VirtualClient } from "./sandbox";
import { normalizePromptContent } from "./prompts";
import {
  MAX_RESULT_TOKENS,
  createOutputPreview,
  estimateJsonTokens,
} from "./read-tool-output";

export function createBuiltinMcpServer(
  passthroughClient: VirtualClient,
  toolOutputMap: Map<string, string>,
) {
  const readPrompt = tool(
    "read_prompt",
    "Read a prompt by name from <available-prompts>. " +
      "Returns the prompt messages with action-oriented guide content. " +
      "Use this to load step-by-step instructions for common tasks.",
    {
      name: z
        .string()
        .min(1)
        .describe("The name of the prompt from <available-prompts>."),
      arguments: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "Optional arguments for the prompt, as key-value string pairs.",
        ),
    },
    async ({ name, arguments: args }) => {
      try {
        const result = await passthroughClient.getPrompt({
          name,
          arguments: args,
        });
        const messages = result.messages;

        if (!messages || messages.length === 0) {
          return {
            content: [
              { type: "text" as const, text: "Prompt returned no content." },
            ],
          };
        }

        const parts = messages.map((m) => ({
          role: m.role,
          content: normalizePromptContent(m.content),
        }));

        const serialized = JSON.stringify(parts, null, 2);
        const tokens = estimateJsonTokens(serialized);

        if (tokens > MAX_RESULT_TOKENS) {
          const toolCallId = `prompt_${Date.now()}`;
          toolOutputMap.set(toolCallId, serialized);
          const preview = createOutputPreview(serialized);
          return {
            content: [
              {
                type: "text" as const,
                text: `Prompt content too large (${tokens} tokens). Use read_tool_output with tool_call_id "${toolCallId}" to extract specific data.\n\nPreview:\n${preview}`,
              },
            ],
          };
        }

        return { content: [{ type: "text" as const, text: serialized }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error reading prompt: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  const readResource = tool(
    "read_resource",
    "Read a resource by its URI. Returns the content of the resource. " +
      "Resource URIs (docs://...) are provided in prompt content.",
    {
      uri: z
        .string()
        .min(1)
        .describe("The URI of the resource to read (e.g. docs://store.md)."),
    },
    async ({ uri }) => {
      try {
        const result = await passthroughClient.readResource({ uri });
        const contents = result.contents;

        if (!contents || contents.length === 0) {
          return {
            content: [
              { type: "text" as const, text: "Resource returned no content." },
            ],
          };
        }

        const parts = contents.map((c) => {
          if ("text" in c && c.text !== undefined) {
            return { uri: c.uri, mimeType: c.mimeType, text: c.text };
          }
          if ("blob" in c && c.blob !== undefined) {
            return {
              uri: c.uri,
              mimeType: c.mimeType,
              blob: `[binary data, ${c.blob.length} bytes base64]`,
            };
          }
          return { uri: c.uri, mimeType: c.mimeType };
        });

        const serialized = JSON.stringify(parts, null, 2);
        const tokens = estimateJsonTokens(serialized);

        if (tokens > MAX_RESULT_TOKENS) {
          const toolCallId = `resource_${Date.now()}`;
          toolOutputMap.set(toolCallId, serialized);
          const preview = createOutputPreview(serialized);
          return {
            content: [
              {
                type: "text" as const,
                text: `Resource content too large (${tokens} tokens). Use read_tool_output with tool_call_id "${toolCallId}" to extract specific data.\n\nPreview:\n${preview}`,
              },
            ],
          };
        }

        return { content: [{ type: "text" as const, text: serialized }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error reading resource: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  const readToolOutput = tool(
    "read_tool_output",
    "Filter a tool output that was too large to display inline. " +
      "Returns all lines matching the given regular expression pattern (grep-like). " +
      "You may call this tool multiple times with different patterns to extract different pieces of information.",
    {
      tool_call_id: z
        .string()
        .describe("The tool call ID from the truncated output."),
      pattern: z
        .string()
        .min(1)
        .describe(
          "Regular expression pattern to filter tool output lines. Returns all matching lines.",
        ),
    },
    async ({ tool_call_id, pattern }) => {
      try {
        if (!toolOutputMap.has(tool_call_id)) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Tool output not found for tool call id: ${tool_call_id}. Available ids: ${[...toolOutputMap.keys()].join(", ") || "(none)"}`,
              },
            ],
          };
        }
        const input = toolOutputMap.get(tool_call_id)!;

        let regex: RegExp;
        try {
          regex = new RegExp(pattern);
        } catch {
          return {
            content: [
              {
                type: "text" as const,
                text: `Invalid regex pattern: ${pattern}`,
              },
            ],
            isError: true,
          };
        }

        const lines = input.split("\n");
        const matching = lines.filter((line) => regex.test(line));
        const resultText = matching.join("\n");

        const tokenCount = estimateJsonTokens(resultText);
        if (tokenCount > MAX_RESULT_TOKENS) {
          const preview = createOutputPreview(resultText);
          return {
            content: [
              {
                type: "text" as const,
                text: `Output is still too long (${tokenCount} tokens), use a more specific pattern to reduce output.\n\nPreview:\n${preview}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                result: resultText,
                matchCount: matching.length,
                totalLines: lines.length,
              }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error filtering tool output: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  return createSdkMcpServer({
    name: "builtins",
    tools: [readPrompt, readResource, readToolOutput],
  });
}

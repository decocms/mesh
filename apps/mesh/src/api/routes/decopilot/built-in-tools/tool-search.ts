/**
 * tool_search Built-in Tool
 *
 * Server-side tool for discovering tools available in the current agent context.
 * Returns tools from the MCP client (built-ins + virtual tools + connection tools).
 */

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { UIMessageStreamWriter } from "ai";
import { tool, zodSchema } from "ai";
import { z } from "zod";

/**
 * Input schema for tool_search (Zod)
 * Exported for testing and type inference
 */
export const ToolSearchInputSchema = z.object({
  query: z
    .string()
    .max(100)
    .optional()
    .describe(
      "Optional search term to filter tools by name or description. " +
        "Leave empty to return all available tools.",
    ),
});

/**
 * Output schema for tool_search (Zod)
 */
export const ToolSearchOutputSchema = z.object({
  tools: z.array(
    z.object({
      name: z.string().describe("Tool name"),
      description: z.string().describe("Tool description"),
    }),
  ),
  totalFound: z.number().describe("Total number of tools found"),
});

const description = "Discover extra tools available in your context.";

const TOOL_SEARCH_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/**
 * tool_search tool definition (AI SDK)
 *
 * This is a SERVER-SIDE tool - it queries the MCP client for available tools
 * and returns their names and descriptions.
 */
export function createToolSearchTool(
  writer: UIMessageStreamWriter,
  mcpClient: Client,
) {
  return tool({
    description,
    inputSchema: zodSchema(ToolSearchInputSchema),
    outputSchema: zodSchema(ToolSearchOutputSchema),
    execute: async ({ query }, options) => {
      const startTime = performance.now();
      try {
        // Get all tools from the MCP client
        const list = await mcpClient.listTools();

        let tools = list.tools.map((t) => ({
          name: t.name,
          description: t.description ?? "",
        }));

        // Apply query filter if provided
        if (query?.trim()) {
          const lowerQuery = query.toLowerCase();
          tools = tools.filter(
            (t) =>
              t.name.toLowerCase().includes(lowerQuery) ||
              t.description.toLowerCase().includes(lowerQuery),
          );
        }

        return {
          tools,
          totalFound: tools.length,
        };
      } finally {
        const latencyMs = performance.now() - startTime;
        writer.write({
          type: "data-tool-metadata",
          id: options.toolCallId,
          data: { annotations: TOOL_SEARCH_ANNOTATIONS, latencyMs },
        });
      }
    },
  });
}

/**
 * CODE_EXECUTION_SEARCH_TOOLS Tool
 *
 * Search for available tools by name or description.
 * Returns tool names and brief descriptions without full schemas.
 *
 * Uses:
 * - If ctx.gatewayId is set: searches tools from gateway connections
 * - Otherwise: searches ALL active connections in the organization
 */

import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { SearchToolsInputSchema, SearchToolsOutputSchema } from "./schema";
import { createSearchToolHandler, getToolsWithConnections } from "./utils";

export const CODE_EXECUTION_SEARCH_TOOLS = defineTool({
  name: "CODE_EXECUTION_SEARCH_TOOLS",
  description:
    "Search for available tools by name or description. Returns tool names and brief descriptions without full schemas. Use this to discover tools before calling CODE_EXECUTION_DESCRIBE_TOOLS for detailed schemas.",

  inputSchema: SearchToolsInputSchema,
  outputSchema: SearchToolsOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    requireOrganization(ctx);
    await ctx.access.check();

    // Get tools from connections (gateway-specific or all org connections)
    const toolContext = await getToolsWithConnections(ctx);

    // Use shared handler factory (no filtering for management MCP)
    const { handler } = createSearchToolHandler(
      toolContext,
      "CODE_EXECUTION",
      false,
    );

    // Execute and extract result
    const result = await handler(input);
    const text = result.content[0];
    if (text?.type === "text") {
      return JSON.parse(text.text);
    }
    throw new Error("Unexpected handler result");
  },
});

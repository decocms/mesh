/**
 * CODE_EXECUTION_DESCRIBE_TOOLS Tool
 *
 * Get detailed schemas for specific tools.
 * Call after searching to get full input/output schemas.
 *
 * Uses:
 * - If ctx.gatewayId is set: describes tools from gateway connections
 * - Otherwise: describes tools from ALL active connections in the organization
 */

import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { DescribeToolsInputSchema, DescribeToolsOutputSchema } from "./schema";
import { createDescribeToolHandler, getToolsWithConnections } from "./utils";

export const CODE_EXECUTION_DESCRIBE_TOOLS = defineTool({
  name: "CODE_EXECUTION_DESCRIBE_TOOLS",
  description:
    "Get detailed schemas for specific tools. Call after CODE_EXECUTION_SEARCH_TOOLS to get full input/output schemas before executing code.",

  inputSchema: DescribeToolsInputSchema,
  outputSchema: DescribeToolsOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    requireOrganization(ctx);
    await ctx.access.check();

    // Get tools from connections (gateway-specific or all org connections)
    const toolContext = await getToolsWithConnections(ctx);

    // Use shared handler factory (no filtering for management MCP)
    const { handler } = createDescribeToolHandler(
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

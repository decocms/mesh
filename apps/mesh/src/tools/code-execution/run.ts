/**
 * CODE_EXECUTION_RUN_CODE Tool
 *
 * Run JavaScript code in a sandbox with access to tools.
 * Code must be an ES module that exports a default async function.
 *
 * Uses:
 * - If ctx.gatewayId is set: runs with tools from gateway connections
 * - Otherwise: runs with tools from ALL active connections in the organization
 */

import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { RunCodeInputSchema, RunCodeOutputSchema } from "./schema";
import { getToolsWithConnections, runCodeWithTools } from "./utils";

export const CODE_EXECUTION_RUN_CODE = defineTool({
  name: "CODE_EXECUTION_RUN_CODE",
  description:
    'Run JavaScript code in a sandbox. Code must be an ES module that `export default`s an async function that receives (tools) as its first parameter. Use CODE_EXECUTION_DESCRIBE_TOOLS to understand the input/output schemas for a tool before calling it. Use `await tools.toolName(args)` or `await tools["tool-name"](args)` to call tools.',

  inputSchema: RunCodeInputSchema,
  outputSchema: RunCodeOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    requireOrganization(ctx);
    await ctx.access.check();

    // Get tools from connections (gateway-specific or all org connections)
    const toolContext = await getToolsWithConnections(ctx);

    // Run code with tools
    const result = await runCodeWithTools(
      input.code,
      toolContext,
      input.timeoutMs,
    );

    return result;
  },
});

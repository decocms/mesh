/**
 * CMS_BRANCH_DELETE Tool
 *
 * Deletes a branch via MCP branch operations.
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";

export const BRANCH_DELETE: ServerPluginToolDefinition = {
  name: "CMS_BRANCH_DELETE",
  description: "Delete a branch.",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
    name: z.string().describe("Branch name to delete"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),

  handler: async (input, ctx) => {
    const { connectionId, name } = input as {
      connectionId: string;
      name: string;
    };
    const proxy = await ctx.createMCPProxy(connectionId);

    try {
      const result = await proxy.callTool({
        name: "DELETE_BRANCH",
        arguments: { name },
      });

      const content = result.content?.[0]?.text;
      if (!content) {
        return { success: !result.isError };
      }

      try {
        return JSON.parse(content);
      } catch {
        return { success: !result.isError };
      }
    } finally {
      await proxy.close?.();
    }
  },
};

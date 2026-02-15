/**
 * CMS_BRANCH_LIST Tool
 *
 * Lists all branches for the site via MCP branch operations.
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";

export const BRANCH_LIST: ServerPluginToolDefinition = {
  name: "CMS_BRANCH_LIST",
  description: "List all branches for the site.",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
  }),
  outputSchema: z.object({
    branches: z.array(
      z.object({
        name: z.string(),
        isDefault: z.boolean(),
      }),
    ),
  }),

  handler: async (input, ctx) => {
    const { connectionId } = input as { connectionId: string };
    const proxy = await ctx.createMCPProxy(connectionId);

    try {
      const result = await proxy.callTool({
        name: "LIST_BRANCHES",
        arguments: {},
      });

      const content = result.content?.[0]?.text;
      if (!content) {
        return { branches: [{ name: "main", isDefault: true }] };
      }

      try {
        return JSON.parse(content);
      } catch {
        return { branches: [{ name: "main", isDefault: true }] };
      }
    } catch {
      // Branch tools not supported, return default
      return { branches: [{ name: "main", isDefault: true }] };
    } finally {
      await proxy.close?.();
    }
  },
};

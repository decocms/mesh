/**
 * CMS_BRANCH_CREATE Tool
 *
 * Creates a new branch for the site via MCP branch operations.
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";

export const BRANCH_CREATE: ServerPluginToolDefinition = {
  name: "CMS_BRANCH_CREATE",
  description: "Create a new branch for the site.",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
    name: z.string().describe("Branch name to create"),
    from: z
      .string()
      .optional()
      .describe("Source branch to create from (defaults to 'main')"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    branch: z.string(),
  }),

  handler: async (input, ctx) => {
    const { connectionId, name, from } = input as {
      connectionId: string;
      name: string;
      from?: string;
    };
    const proxy = await ctx.createMCPProxy(connectionId);

    try {
      const result = await proxy.callTool({
        name: "CREATE_BRANCH",
        arguments: { name, from },
      });

      const content = result.content?.[0]?.text;
      if (!content) {
        return { success: false, branch: name };
      }

      try {
        return JSON.parse(content);
      } catch {
        return { success: !result.isError, branch: name };
      }
    } finally {
      await proxy.close?.();
    }
  },
};

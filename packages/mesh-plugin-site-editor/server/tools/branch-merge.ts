/**
 * CMS_BRANCH_MERGE Tool
 *
 * Merges a source branch into a target branch via MCP branch operations.
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";

export const BRANCH_MERGE: ServerPluginToolDefinition = {
  name: "CMS_BRANCH_MERGE",
  description: "Merge a source branch into a target branch.",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
    source: z.string().describe("Source branch to merge from"),
    target: z
      .string()
      .optional()
      .describe("Target branch to merge into (defaults to 'main')"),
    deleteSource: z
      .boolean()
      .optional()
      .describe("Whether to delete the source branch after merge"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string().optional(),
  }),

  handler: async (input, ctx) => {
    const { connectionId, source, target, deleteSource } = input as {
      connectionId: string;
      source: string;
      target?: string;
      deleteSource?: boolean;
    };
    const proxy = await ctx.createMCPProxy(connectionId);

    try {
      const result = await proxy.callTool({
        name: "MERGE_BRANCH",
        arguments: { source, target, deleteSource },
      });

      const content = result.content?.[0]?.text;
      if (!content) {
        return { success: !result.isError };
      }

      try {
        return JSON.parse(content);
      } catch {
        return { success: !result.isError, message: content };
      }
    } finally {
      await proxy.close?.();
    }
  },
};

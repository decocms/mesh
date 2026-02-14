/**
 * CMS_BLOCK_GET Tool
 *
 * Reads a single block definition by ID from .deco/blocks/{blockId}.json via MCP.
 * Returns the full BlockDefinition including JSON Schema.
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";

export const BLOCK_GET: ServerPluginToolDefinition = {
  name: "CMS_BLOCK_GET",
  description:
    "Get a single CMS block definition by ID, including its full JSON Schema.",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
    blockId: z.string().describe('Block ID (e.g., "sections--Hero")'),
  }),
  outputSchema: z.object({
    block: z
      .object({
        id: z.string(),
        component: z.string(),
        label: z.string(),
        category: z.string(),
        description: z.string(),
        schema: z.record(z.string(), z.unknown()),
        defaults: z.record(z.string(), z.unknown()),
        metadata: z.object({
          scannedAt: z.string(),
          scanMethod: z.string(),
          propsTypeName: z.string().nullable(),
          customized: z.array(z.string()),
        }),
      })
      .nullable(),
  }),

  handler: async (input, ctx) => {
    const { connectionId, blockId } = input as {
      connectionId: string;
      blockId: string;
    };
    const proxy = await ctx.createMCPProxy(connectionId);

    try {
      const readResult = await proxy.callTool({
        name: "READ_FILE",
        arguments: { path: `.deco/blocks/${blockId}.json` },
      });

      if (readResult.isError) {
        return { block: null };
      }

      const content = readResult.content?.[0]?.text;
      if (!content) {
        return { block: null };
      }

      try {
        const block = JSON.parse(content);
        if (block.deleted) {
          return { block: null };
        }
        return { block };
      } catch {
        return { block: null };
      }
    } finally {
      await proxy.close?.();
    }
  },
};

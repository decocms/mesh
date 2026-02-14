/**
 * CMS_BLOCK_LIST Tool
 *
 * Lists all block definitions from .deco/blocks/ via MCP file operations.
 * Returns summaries with id, component, label, category, and prop count.
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";

export const BLOCK_LIST: ServerPluginToolDefinition = {
  name: "CMS_BLOCK_LIST",
  description:
    "List all CMS block definitions with their metadata (id, component, label, category, propsCount).",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
  }),
  outputSchema: z.object({
    blocks: z.array(
      z.object({
        id: z.string(),
        component: z.string(),
        label: z.string(),
        category: z.string(),
        propsCount: z.number(),
      }),
    ),
  }),

  handler: async (input, ctx) => {
    const { connectionId } = input as { connectionId: string };
    const proxy = await ctx.createMCPProxy(connectionId);

    try {
      const listResult = await proxy.callTool({
        name: "LIST_FILES",
        arguments: { prefix: ".deco/blocks/" },
      });

      const listContent = listResult.content?.[0]?.text;
      if (!listContent) {
        return { blocks: [] };
      }

      let fileList: { files?: Array<{ path: string }>; count?: number };
      try {
        fileList = JSON.parse(listContent);
      } catch {
        return { blocks: [] };
      }

      if (!fileList.files || fileList.files.length === 0) {
        return { blocks: [] };
      }

      const blocks: Array<{
        id: string;
        component: string;
        label: string;
        category: string;
        propsCount: number;
      }> = [];

      for (const file of fileList.files) {
        if (!file.path.endsWith(".json")) continue;

        try {
          const readResult = await proxy.callTool({
            name: "READ_FILE",
            arguments: { path: file.path },
          });

          const content = readResult.content?.[0]?.text;
          if (!content) continue;

          const block = JSON.parse(content);
          if (block.deleted) continue; // Skip tombstoned blocks

          const propsCount = Object.keys(block.schema?.properties ?? {}).length;

          blocks.push({
            id: block.id,
            component: block.component,
            label: block.label,
            category: block.category ?? "Other",
            propsCount,
          });
        } catch {
          // Skip files that can't be read or parsed
          continue;
        }
      }

      // Sort by label alphabetically
      blocks.sort((a, b) => a.label.localeCompare(b.label));

      return { blocks };
    } finally {
      await proxy.close?.();
    }
  },
};

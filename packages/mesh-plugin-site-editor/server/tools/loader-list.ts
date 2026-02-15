/**
 * CMS_LOADER_LIST Tool
 *
 * Lists all loader definitions from .deco/loaders/ via MCP file operations.
 * Returns summaries with id, source, label, category, and input param count.
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { createSiteProxy } from "../site-proxy";

export const LOADER_LIST: ServerPluginToolDefinition = {
  name: "CMS_LOADER_LIST",
  description:
    "List all CMS loader definitions with their metadata (id, source, label, category, inputParamsCount).",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
  }),
  outputSchema: z.object({
    loaders: z.array(
      z.object({
        id: z.string(),
        source: z.string(),
        label: z.string(),
        category: z.string(),
        inputParamsCount: z.number(),
      }),
    ),
  }),

  handler: async (input, ctx) => {
    const { connectionId } = input as { connectionId: string };
    const proxy = await createSiteProxy(await ctx.createMCPProxy(connectionId));

    try {
      const listResult = await proxy.callTool({
        name: "LIST_FILES",
        arguments: { prefix: ".deco/loaders/" },
      });

      const listContent = listResult.content?.[0]?.text;
      if (!listContent) {
        return { loaders: [] };
      }

      let fileList: { files?: Array<{ path: string }>; count?: number };
      try {
        fileList = JSON.parse(listContent);
      } catch {
        return { loaders: [] };
      }

      if (!fileList.files || fileList.files.length === 0) {
        return { loaders: [] };
      }

      const loaders: Array<{
        id: string;
        source: string;
        label: string;
        category: string;
        inputParamsCount: number;
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

          const loader = JSON.parse(content);
          if (loader.deleted) continue; // Skip tombstoned loaders

          const inputParamsCount = Object.keys(
            loader.inputSchema?.properties ?? {},
          ).length;

          loaders.push({
            id: loader.id,
            source: loader.source,
            label: loader.label,
            category: loader.category ?? "Other",
            inputParamsCount,
          });
        } catch {
          // Skip files that can't be read or parsed
          continue;
        }
      }

      // Sort by label alphabetically
      loaders.sort((a, b) => a.label.localeCompare(b.label));

      return { loaders };
    } finally {
      await proxy.close?.();
    }
  },
};

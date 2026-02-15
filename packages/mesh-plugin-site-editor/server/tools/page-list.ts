/**
 * CMS_PAGE_LIST Tool
 *
 * Lists all pages stored in .deco/pages/ via MCP file operations.
 * For each JSON file found, reads its content to extract page metadata.
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { createSiteProxy } from "../site-proxy";

const PageSummarySchema = z.object({
  id: z.string(),
  path: z.string(),
  title: z.string(),
  updatedAt: z.string(),
});

export const PAGE_LIST: ServerPluginToolDefinition = {
  name: "CMS_PAGE_LIST",
  description:
    "List all CMS pages with their metadata (id, path, title, updatedAt).",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
  }),
  outputSchema: z.object({
    pages: z.array(PageSummarySchema),
  }),

  handler: async (input, ctx) => {
    const { connectionId } = input as { connectionId: string };
    const proxy = await createSiteProxy(await ctx.createMCPProxy(connectionId));

    try {
      // List files under .deco/pages/
      const listResult = await proxy.callTool({
        name: "LIST_FILES",
        arguments: { prefix: ".deco/pages/" },
      });

      const listContent = listResult.content?.[0]?.text;
      if (!listContent) {
        return { pages: [] };
      }

      let fileList: { files: Array<{ path: string }>; count: number };
      try {
        fileList = JSON.parse(listContent);
      } catch {
        return { pages: [] };
      }

      if (!fileList.files || fileList.files.length === 0) {
        return { pages: [] };
      }

      // Read each .json file to get page metadata
      const pages: Array<{
        id: string;
        path: string;
        title: string;
        updatedAt: string;
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

          const page = JSON.parse(content);
          if (page.deleted) continue; // Skip tombstoned pages

          pages.push({
            id: page.id,
            path: page.path,
            title: page.title,
            updatedAt: page.metadata?.updatedAt ?? "",
          });
        } catch {
          // Skip files that can't be read or parsed
          continue;
        }
      }

      // Sort by updatedAt descending
      pages.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      return { pages };
    } finally {
      await proxy.close?.();
    }
  },
};

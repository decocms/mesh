/**
 * CMS_PAGE_UPDATE Tool
 *
 * Updates an existing page by reading, merging fields, and writing back.
 * Only overwrites fields that are present in input.
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";

const PageSchema = z.object({
  id: z.string(),
  path: z.string(),
  title: z.string(),
  blocks: z.array(z.unknown()),
  metadata: z.object({
    description: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
});

export const PAGE_UPDATE: ServerPluginToolDefinition = {
  name: "CMS_PAGE_UPDATE",
  description:
    "Update an existing CMS page. Only provided fields are overwritten.",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
    pageId: z.string().describe("Page ID to update"),
    title: z.string().optional().describe("New page title"),
    path: z.string().optional().describe("New URL path"),
    blocks: z.array(z.unknown()).optional().describe("Page content blocks"),
  }),
  outputSchema: z.object({
    page: PageSchema,
  }),

  handler: async (input, ctx) => {
    const { connectionId, pageId, title, path, blocks } = input as {
      connectionId: string;
      pageId: string;
      title?: string;
      path?: string;
      blocks?: unknown[];
    };
    const proxy = await ctx.createMCPProxy(connectionId);

    try {
      // Read existing page
      const readResult = await proxy.callTool({
        name: "READ_FILE",
        arguments: { path: `.deco/pages/${pageId}.json` },
      });

      const content = readResult.content?.[0]?.text;
      if (!content) {
        throw new Error(`Page ${pageId} not found`);
      }

      const page = JSON.parse(content);

      // Merge provided fields
      if (title !== undefined) page.title = title;
      if (path !== undefined) page.path = path;
      if (blocks !== undefined) page.blocks = blocks;

      // Update timestamp
      page.metadata = {
        ...page.metadata,
        updatedAt: new Date().toISOString(),
      };

      // Write back
      const updatedContent = JSON.stringify(page, null, 2);

      await proxy.callTool({
        name: "PUT_FILE",
        arguments: {
          path: `.deco/pages/${pageId}.json`,
          content: updatedContent,
        },
      });

      return { page };
    } finally {
      await proxy.close?.();
    }
  },
};

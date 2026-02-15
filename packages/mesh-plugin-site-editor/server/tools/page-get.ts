/**
 * CMS_PAGE_GET Tool
 *
 * Reads a single page by ID from .deco/pages/{pageId}.json via MCP.
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { createSiteProxy } from "../site-proxy";

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

export const PAGE_GET: ServerPluginToolDefinition = {
  name: "CMS_PAGE_GET",
  description: "Get a single CMS page by ID, including all fields.",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
    pageId: z.string().describe("Page ID (e.g., page_V1StGXR8)"),
  }),
  outputSchema: z.object({
    page: PageSchema.nullable(),
  }),

  handler: async (input, ctx) => {
    const { connectionId, pageId } = input as {
      connectionId: string;
      pageId: string;
    };
    const proxy = await createSiteProxy(await ctx.createMCPProxy(connectionId));

    try {
      const readResult = await proxy.callTool({
        name: "READ_FILE",
        arguments: { path: `.deco/pages/${pageId}.json` },
      });

      if (readResult.isError) {
        return { page: null };
      }

      const content = readResult.content?.[0]?.text;
      if (!content) {
        return { page: null };
      }

      try {
        const page = JSON.parse(content);
        if (page.deleted) {
          return { page: null };
        }
        return { page };
      } catch {
        return { page: null };
      }
    } finally {
      await proxy.close?.();
    }
  },
};

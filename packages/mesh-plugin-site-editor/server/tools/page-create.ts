/**
 * CMS_PAGE_CREATE Tool
 *
 * Creates a new page as a JSON file in .deco/pages/{id}.json via MCP.
 * Generates a unique ID with nanoid prefixed by "page_".
 */

import { z } from "zod";
import { nanoid } from "nanoid";
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

export const PAGE_CREATE: ServerPluginToolDefinition = {
  name: "CMS_PAGE_CREATE",
  description: "Create a new CMS page with title and path.",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
    title: z.string().describe("Page title"),
    path: z.string().describe("URL path (e.g., /, /about)"),
  }),
  outputSchema: z.object({
    page: PageSchema,
  }),

  handler: async (input, ctx) => {
    const { connectionId, title, path } = input as {
      connectionId: string;
      title: string;
      path: string;
    };
    const proxy = await createSiteProxy(await ctx.createMCPProxy(connectionId));

    try {
      const id = `page_${nanoid(8)}`;
      const now = new Date().toISOString();

      const page = {
        id,
        path,
        title,
        blocks: [],
        metadata: {
          description: "",
          createdAt: now,
          updatedAt: now,
        },
      };

      const content = JSON.stringify(page, null, 2);

      await proxy.callTool({
        name: "PUT_FILE",
        arguments: {
          path: `.deco/pages/${id}.json`,
          content,
        },
      });

      return { page };
    } finally {
      await proxy.close?.();
    }
  },
};

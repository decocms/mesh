/**
 * CMS_PAGE_DELETE Tool
 *
 * Deletes a page by ID. Attempts to call DELETE_FILE on the MCP proxy.
 * If DELETE_FILE is not available, writes a tombstone JSON as fallback.
 *
 * Phase 1 limitation: The SITE_BINDING only defines READ_FILE, PUT_FILE,
 * LIST_FILES. DELETE_FILE may or may not be available on the underlying
 * MCP server. The tombstone fallback ensures delete always "works" even
 * when the server doesn't support file deletion.
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";

export const PAGE_DELETE: ServerPluginToolDefinition = {
  name: "CMS_PAGE_DELETE",
  description: "Delete a CMS page by ID.",
  inputSchema: z.object({
    connectionId: z.string().describe("MCP connection ID for the site"),
    pageId: z.string().describe("Page ID to delete"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),

  handler: async (input, ctx) => {
    const { connectionId, pageId } = input as {
      connectionId: string;
      pageId: string;
    };
    const proxy = await ctx.createMCPProxy(connectionId);

    try {
      const filePath = `.deco/pages/${pageId}.json`;

      // Try DELETE_FILE first (may be available even if not in the binding)
      try {
        const result = await proxy.callTool({
          name: "DELETE_FILE",
          arguments: { path: filePath },
        });

        if (!result.isError) {
          return { success: true };
        }
      } catch {
        // DELETE_FILE not available, fall through to tombstone
      }

      // Fallback: write a tombstone file
      await proxy.callTool({
        name: "PUT_FILE",
        arguments: {
          path: filePath,
          content: JSON.stringify(
            { deleted: true, deletedAt: new Date().toISOString() },
            null,
            2,
          ),
        },
      });

      return { success: true };
    } finally {
      await proxy.close?.();
    }
  },
};

import { createTool } from "@decocms/runtime/tools";
import { z } from "zod";
import { deleteSite } from "../lib/storage.ts";

export const SITE_DELETE = createTool({
  id: "SITE_DELETE",
  description: "Remove a tracked website and all its stored performance data.",
  annotations: {
    title: "Delete Site",
    destructiveHint: true,
  },
  inputSchema: z.object({
    siteId: z.string().describe("The site ID to delete"),
  }),
  execute: async ({ context }) => {
    const deleted = await deleteSite(context.siteId);
    return {
      deleted,
      siteId: context.siteId,
      message: deleted
        ? `Site ${context.siteId} deleted.`
        : `Site ${context.siteId} not found.`,
    };
  },
});

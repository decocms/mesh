import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth } from "../../core/mesh-context";
import { SidebarItemSchema } from "./schema.ts";

export const ORGANIZATION_SETTINGS_GET = defineTool({
  name: "ORGANIZATION_SETTINGS_GET",
  description: "Get organization-level settings",

  inputSchema: z.object({}),

  outputSchema: z.object({
    organizationId: z.string(),
    sidebar_items: z.array(SidebarItemSchema).nullable().optional(),
    createdAt: z.union([z.date(), z.string()]).optional(),
    updatedAt: z.union([z.date(), z.string()]).optional(),
  }),

  handler: async (_, ctx) => {
    requireAuth(ctx);
    await ctx.access.check();
    const organizationId = ctx.organization?.id;
    if (!organizationId) {
      throw new Error(
        "Organization ID required (no active organization in context)",
      );
    }

    const settings = await ctx.storage.organizationSettings.get(organizationId);

    if (!settings) {
      return {
        organizationId,
      };
    }

    return settings;
  },
});

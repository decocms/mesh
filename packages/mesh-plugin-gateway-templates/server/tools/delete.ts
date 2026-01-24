/**
 * Gateway Templates Plugin - Delete Tool
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { GatewayTemplateDeleteInputSchema } from "./schema";
import { getPluginStorage } from "./utils";

export const GATEWAY_TEMPLATE_DELETE: ServerPluginToolDefinition = {
  name: "GATEWAY_TEMPLATE_DELETE",
  description: "Delete a gateway template",
  inputSchema: GatewayTemplateDeleteInputSchema,
  outputSchema: z.object({
    success: z.boolean(),
    id: z.string(),
  }),

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<
      typeof GatewayTemplateDeleteInputSchema
    >;
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
    };

    // Require organization context
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }

    // Check access
    await meshCtx.access.check();

    const storage = getPluginStorage();

    // Verify template belongs to organization
    const existing = await storage.templates.findById(typedInput.id);
    if (!existing) {
      throw new Error(`Template not found: ${typedInput.id}`);
    }
    if (existing.organization_id !== meshCtx.organization.id) {
      throw new Error(
        "Access denied: template belongs to another organization",
      );
    }

    await storage.templates.delete(typedInput.id);

    return { success: true, id: typedInput.id };
  },
};

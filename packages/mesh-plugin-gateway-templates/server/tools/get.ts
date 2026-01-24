/**
 * Gateway Templates Plugin - Get Tool
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  GatewayTemplateGetInputSchema,
  GatewayTemplateEntitySchema,
} from "./schema";
import { getPluginStorage } from "./utils";

export const GATEWAY_TEMPLATE_GET: ServerPluginToolDefinition = {
  name: "GATEWAY_TEMPLATE_GET",
  description: "Get a gateway template by ID",
  inputSchema: GatewayTemplateGetInputSchema,
  outputSchema: GatewayTemplateEntitySchema.nullable(),

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof GatewayTemplateGetInputSchema>;
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

    const template = await storage.templates.findById(typedInput.id);

    // Verify template belongs to organization
    if (template && template.organization_id !== meshCtx.organization.id) {
      throw new Error(
        "Access denied: template belongs to another organization",
      );
    }

    return template;
  },
};

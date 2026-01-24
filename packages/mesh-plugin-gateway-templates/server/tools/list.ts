/**
 * Gateway Templates Plugin - List Tool
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  GatewayTemplateListInputSchema,
  GatewayTemplateEntitySchema,
} from "./schema";
import { getPluginStorage } from "./utils";

export const GATEWAY_TEMPLATE_LIST: ServerPluginToolDefinition = {
  name: "GATEWAY_TEMPLATE_LIST",
  description: "List all gateway templates in the organization",
  inputSchema: GatewayTemplateListInputSchema,
  outputSchema: z.object({
    templates: z.array(GatewayTemplateEntitySchema),
  }),

  handler: async (_input, ctx) => {
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

    const templates = await storage.templates.list(meshCtx.organization.id);

    return { templates };
  },
};

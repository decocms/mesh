/**
 * Gateway Templates Plugin - List Sessions Tool
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  GatewayTemplateListSessionsInputSchema,
  GatewayTemplateListSessionsOutputSchema,
} from "./schema";
import { getPluginStorage } from "./utils";

export const GATEWAY_TEMPLATE_LIST_SESSIONS: ServerPluginToolDefinition = {
  name: "GATEWAY_TEMPLATE_LIST_SESSIONS",
  description: "List connect sessions for monitoring and management",
  inputSchema: GatewayTemplateListSessionsInputSchema,
  outputSchema: GatewayTemplateListSessionsOutputSchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<
      typeof GatewayTemplateListSessionsInputSchema
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

    let sessions;

    if (typedInput.templateId) {
      // Verify template belongs to organization
      const template = await storage.templates.findById(typedInput.templateId);
      if (!template) {
        throw new Error(`Template not found: ${typedInput.templateId}`);
      }
      if (template.organization_id !== meshCtx.organization.id) {
        throw new Error(
          "Access denied: template belongs to another organization",
        );
      }

      sessions = await storage.sessions.listByTemplate(typedInput.templateId);
    } else {
      sessions = await storage.sessions.listByOrganization(
        meshCtx.organization.id,
      );
    }

    return { sessions };
  },
};

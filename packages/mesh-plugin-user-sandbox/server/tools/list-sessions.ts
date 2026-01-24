/**
 * User Sandbox Plugin - List Sessions Tool
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  UserSandboxListSessionsInputSchema,
  UserSandboxListSessionsOutputSchema,
} from "./schema";
import { getPluginStorage } from "./utils";

export const USER_SANDBOX_LIST_SESSIONS: ServerPluginToolDefinition = {
  name: "USER_SANDBOX_LIST_SESSIONS",
  description: "List connect sessions for monitoring and management",
  inputSchema: UserSandboxListSessionsInputSchema,
  outputSchema: UserSandboxListSessionsOutputSchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<
      typeof UserSandboxListSessionsInputSchema
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

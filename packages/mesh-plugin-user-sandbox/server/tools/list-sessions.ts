/**
 * User Sandbox Plugin - List Sessions Tool
 */

import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  UserSandboxListSessionsInputSchema,
  UserSandboxListSessionsOutputSchema,
} from "./schema";
import { getPluginStorage, orgHandler } from "./utils";

export const USER_SANDBOX_LIST_SESSIONS: ServerPluginToolDefinition = {
  name: "USER_SANDBOX_LIST_SESSIONS",
  description: "List connect sessions for monitoring and management",
  inputSchema: UserSandboxListSessionsInputSchema,
  outputSchema: UserSandboxListSessionsOutputSchema,

  handler: orgHandler(
    UserSandboxListSessionsInputSchema,
    async (input, ctx) => {
      const storage = getPluginStorage();

      if (input.templateId) {
        const template = await storage.templates.findById(input.templateId);
        if (!template) {
          throw new Error(`Template not found: ${input.templateId}`);
        }
        if (template.organization_id !== ctx.organization.id) {
          throw new Error(
            "Access denied: template belongs to another organization",
          );
        }

        const sessions = await storage.sessions.listByTemplate(
          input.templateId,
        );
        return { sessions };
      }

      const sessions = await storage.sessions.listByOrganization(
        ctx.organization.id,
      );
      return { sessions };
    },
  ),
};

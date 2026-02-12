/**
 * User Sandbox Plugin - Get Tool
 */

import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { UserSandboxGetInputSchema, UserSandboxEntitySchema } from "./schema";
import { getPluginStorage, orgHandler } from "./utils";

export const USER_SANDBOX_GET: ServerPluginToolDefinition = {
  name: "USER_SANDBOX_GET",
  description: "Get a user sandbox by ID",
  inputSchema: UserSandboxGetInputSchema,
  outputSchema: UserSandboxEntitySchema,

  handler: orgHandler(UserSandboxGetInputSchema, async (input, ctx) => {
    const storage = getPluginStorage();
    const template = await storage.templates.findById(input.id);

    if (template && template.organization_id !== ctx.organization.id) {
      throw new Error(
        "Access denied: template belongs to another organization",
      );
    }

    return template;
  }),
};

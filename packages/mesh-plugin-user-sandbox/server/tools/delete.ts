/**
 * User Sandbox Plugin - Delete Tool
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { UserSandboxDeleteInputSchema } from "./schema";
import { getPluginStorage, orgHandler } from "./utils";

export const USER_SANDBOX_DELETE: ServerPluginToolDefinition = {
  name: "USER_SANDBOX_DELETE",
  description: "Delete a user sandbox",
  inputSchema: UserSandboxDeleteInputSchema,
  outputSchema: z.object({
    success: z.boolean(),
    id: z.string(),
  }),

  handler: orgHandler(UserSandboxDeleteInputSchema, async (input, ctx) => {
    const storage = getPluginStorage();

    const existing = await storage.templates.findById(input.id);
    if (!existing) {
      throw new Error(`Template not found: ${input.id}`);
    }
    if (existing.organization_id !== ctx.organization.id) {
      throw new Error(
        "Access denied: template belongs to another organization",
      );
    }

    await storage.templates.delete(input.id);
    return { success: true, id: input.id };
  }),
};

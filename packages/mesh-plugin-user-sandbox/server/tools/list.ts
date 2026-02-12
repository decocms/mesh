/**
 * User Sandbox Plugin - List Tool
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { UserSandboxListInputSchema, UserSandboxEntitySchema } from "./schema";
import { getPluginStorage } from "./utils";

export const USER_SANDBOX_LIST: ServerPluginToolDefinition = {
  name: "USER_SANDBOX_LIST",
  description: "List all user sandbox in the organization",
  inputSchema: UserSandboxListInputSchema,
  outputSchema: z.object({
    templates: z.array(UserSandboxEntitySchema),
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

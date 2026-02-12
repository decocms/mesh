/**
 * User Sandbox Plugin - List Tool
 */

import { z } from "zod";
import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { UserSandboxListInputSchema, UserSandboxEntitySchema } from "./schema";
import { getPluginStorage, orgHandler } from "./utils";

export const USER_SANDBOX_LIST: ServerPluginToolDefinition = {
  name: "USER_SANDBOX_LIST",
  description: "List all user sandbox in the organization",
  inputSchema: UserSandboxListInputSchema,
  outputSchema: z.object({
    templates: z.array(UserSandboxEntitySchema),
  }),

  handler: orgHandler(UserSandboxListInputSchema, async (_input, ctx) => {
    const storage = getPluginStorage();
    const templates = await storage.templates.list(ctx.organization.id);
    return { templates };
  }),
};

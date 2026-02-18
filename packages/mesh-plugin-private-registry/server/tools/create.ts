import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  RegistryCreateInputSchema,
  RegistryCreateOutputSchema,
} from "./schema";
import { getPluginStorage, orgHandler } from "./utils";

export const REGISTRY_ITEM_CREATE: ServerPluginToolDefinition = {
  name: "REGISTRY_ITEM_CREATE",
  description: "Create a private registry item",
  inputSchema: RegistryCreateInputSchema,
  outputSchema: RegistryCreateOutputSchema,

  handler: orgHandler(RegistryCreateInputSchema, async (input, ctx) => {
    const storage = getPluginStorage();
    const item = await storage.items.create({
      ...input.data,
      organization_id: ctx.organization.id,
      created_by: ctx.auth.user?.id ?? null,
    });
    return { item };
  }),
};

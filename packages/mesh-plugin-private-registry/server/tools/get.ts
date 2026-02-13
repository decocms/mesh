import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { RegistryGetInputSchema, RegistryGetOutputSchema } from "./schema";
import { getPluginStorage, orgHandler } from "./utils";

export const COLLECTION_REGISTRY_APP_GET: ServerPluginToolDefinition = {
  name: "COLLECTION_REGISTRY_APP_GET",
  description: "Get a private registry item by ID or name",
  inputSchema: RegistryGetInputSchema,
  outputSchema: RegistryGetOutputSchema,

  handler: orgHandler(RegistryGetInputSchema, async (input, ctx) => {
    const itemId = input.id ?? input.name;
    if (!itemId) {
      throw new Error("Either 'id' or 'name' is required");
    }

    const storage = getPluginStorage();
    return {
      item: await storage.items.findByIdOrName(ctx.organization.id, itemId),
    };
  }),
};

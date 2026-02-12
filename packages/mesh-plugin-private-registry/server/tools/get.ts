import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import { RegistryGetInputSchema, RegistryGetOutputSchema } from "./schema";
import { getPluginStorage, requireOrgContext } from "./utils";

export const COLLECTION_REGISTRY_APP_GET: ServerPluginToolDefinition = {
  name: "COLLECTION_REGISTRY_APP_GET",
  description: "Get a private registry item by ID or name",
  inputSchema: RegistryGetInputSchema,
  outputSchema: RegistryGetOutputSchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof RegistryGetInputSchema>;
    const meshCtx = await requireOrgContext(ctx);

    const itemId = typedInput.id ?? typedInput.name;
    if (!itemId) {
      throw new Error("Either 'id' or 'name' is required");
    }

    const storage = getPluginStorage();
    return {
      item: await storage.items.findByIdOrName(meshCtx.organization.id, itemId),
    };
  },
};

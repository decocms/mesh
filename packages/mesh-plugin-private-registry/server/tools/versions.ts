import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import { RegistryGetInputSchema, RegistryItemSchema } from "./schema";
import { getPluginStorage, requireOrgContext } from "./utils";

export const COLLECTION_REGISTRY_APP_VERSIONS: ServerPluginToolDefinition = {
  name: "COLLECTION_REGISTRY_APP_VERSIONS",
  description: "Get available versions of a registry item",
  inputSchema: RegistryGetInputSchema,
  outputSchema: z.object({
    versions: z.array(RegistryItemSchema),
  }),

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof RegistryGetInputSchema>;
    const meshCtx = await requireOrgContext(ctx);

    const itemId = typedInput.id ?? typedInput.name;
    if (!itemId) {
      throw new Error("Either 'id' or 'name' is required");
    }

    const storage = getPluginStorage();
    const item = await storage.items.findById(meshCtx.organization.id, itemId);
    return { versions: item ? [item] : [] };
  },
};

import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import { RegistryGetInputSchema, RegistryItemSchema } from "./schema";
import { getPluginStorage } from "./utils";

export const COLLECTION_REGISTRY_APP_VERSIONS: ServerPluginToolDefinition = {
  name: "COLLECTION_REGISTRY_APP_VERSIONS",
  description: "Get available versions of a registry item",
  inputSchema: RegistryGetInputSchema,
  outputSchema: z.object({
    versions: z.array(RegistryItemSchema),
  }),

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof RegistryGetInputSchema>;
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
    };
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }
    await meshCtx.access.check();

    // Accept both 'id' and 'name' as the item identifier
    const itemId = typedInput.id ?? typedInput.name;
    if (!itemId) {
      throw new Error("Either 'id' or 'name' is required");
    }

    const storage = getPluginStorage();
    const item = await storage.items.findById(meshCtx.organization.id, itemId);

    // Return array with single version (current version)
    // In the future, this could query a versions table
    return {
      versions: item ? [item] : [],
    };
  },
};

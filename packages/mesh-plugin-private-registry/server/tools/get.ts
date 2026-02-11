import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import { RegistryGetInputSchema, RegistryGetOutputSchema } from "./schema";
import { getPluginStorage } from "./utils";

export const COLLECTION_REGISTRY_APP_GET: ServerPluginToolDefinition = {
  name: "COLLECTION_REGISTRY_APP_GET",
  description: "Get a private registry item by ID",
  inputSchema: RegistryGetInputSchema,
  outputSchema: RegistryGetOutputSchema,

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

    // Accept both 'id' and 'name' as the item identifier (name is sent by the Store detail page)
    const itemId = typedInput.id ?? typedInput.name;
    if (!itemId) {
      throw new Error("Either 'id' or 'name' is required");
    }

    const storage = getPluginStorage();
    return {
      item: await storage.items.findById(meshCtx.organization.id, itemId),
    };
  },
};

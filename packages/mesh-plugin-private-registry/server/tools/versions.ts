import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import { RegistryGetInputSchema, RegistryItemSchema } from "./schema";
import { getPluginStorage, orgHandler } from "./utils";

export const REGISTRY_ITEM_VERSIONS: ServerPluginToolDefinition = {
  name: "REGISTRY_ITEM_VERSIONS",
  description: "Get available versions of a registry item",
  inputSchema: RegistryGetInputSchema,
  outputSchema: z.object({
    versions: z.array(RegistryItemSchema),
  }),

  handler: orgHandler(RegistryGetInputSchema, async (input, ctx) => {
    const itemId = input.id ?? input.name;
    if (!itemId) {
      throw new Error("Either 'id' or 'name' is required");
    }

    const storage = getPluginStorage();
    const item = await storage.items.findByIdOrName(
      ctx.organization.id,
      itemId,
    );
    return { versions: item ? [item] : [] };
  }),
};

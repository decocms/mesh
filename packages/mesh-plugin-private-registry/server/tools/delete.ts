import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  RegistryDeleteInputSchema,
  RegistryDeleteOutputSchema,
} from "./schema";
import { getPluginStorage, orgHandler } from "./utils";

export const REGISTRY_ITEM_DELETE: ServerPluginToolDefinition = {
  name: "REGISTRY_ITEM_DELETE",
  description: "Delete a private registry item",
  inputSchema: RegistryDeleteInputSchema,
  outputSchema: RegistryDeleteOutputSchema,

  handler: orgHandler(RegistryDeleteInputSchema, async (input, ctx) => {
    const storage = getPluginStorage();
    const item = await storage.items.delete(ctx.organization.id, input.id);
    if (!item) {
      throw new Error(`Registry item not found: ${input.id}`);
    }
    return { item };
  }),
};

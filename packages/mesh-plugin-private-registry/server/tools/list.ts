import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { RegistryListInputSchema, RegistryListOutputSchema } from "./schema";
import { getPluginStorage, orgHandler } from "./utils";

export const REGISTRY_ITEM_LIST: ServerPluginToolDefinition = {
  name: "REGISTRY_ITEM_LIST",
  description: "List private registry items for the current organization",
  inputSchema: RegistryListInputSchema,
  outputSchema: RegistryListOutputSchema,

  handler: orgHandler(RegistryListInputSchema, async (input, ctx) => {
    const storage = getPluginStorage();
    return storage.items.list(ctx.organization.id, input);
  }),
};

import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { RegistryListInputSchema, RegistryListOutputSchema } from "./schema";
import { getPluginStorage, orgHandler } from "./utils";

export const COLLECTION_REGISTRY_APP_LIST: ServerPluginToolDefinition = {
  name: "COLLECTION_REGISTRY_APP_LIST",
  description: "List private registry items for the current organization",
  inputSchema: RegistryListInputSchema,
  outputSchema: RegistryListOutputSchema,

  handler: orgHandler(RegistryListInputSchema, async (input, ctx) => {
    const storage = getPluginStorage();
    return storage.items.list(ctx.organization.id, {
      ...input,
      includeUnlisted: input.includeUnlisted,
    });
  }),
};

import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import { RegistryListInputSchema, RegistryListOutputSchema } from "./schema";
import { getPluginStorage, requireOrgContext } from "./utils";

export const COLLECTION_REGISTRY_APP_LIST: ServerPluginToolDefinition = {
  name: "COLLECTION_REGISTRY_APP_LIST",
  description: "List private registry items for the current organization",
  inputSchema: RegistryListInputSchema,
  outputSchema: RegistryListOutputSchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof RegistryListInputSchema>;
    const meshCtx = await requireOrgContext(ctx);
    const storage = getPluginStorage();
    return storage.items.list(meshCtx.organization.id, typedInput);
  },
};

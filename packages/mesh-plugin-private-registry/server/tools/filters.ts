import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import { RegistryFiltersOutputSchema } from "./schema";
import { getPluginStorage, requireOrgContext } from "./utils";

export const COLLECTION_REGISTRY_APP_FILTERS: ServerPluginToolDefinition = {
  name: "COLLECTION_REGISTRY_APP_FILTERS",
  description: "List available tag/category filters for private registry items",
  inputSchema: z.object({}),
  outputSchema: RegistryFiltersOutputSchema,

  handler: async (_input, ctx) => {
    const meshCtx = await requireOrgContext(ctx);
    const storage = getPluginStorage();
    return storage.items.getFilters(meshCtx.organization.id);
  },
};

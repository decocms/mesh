import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import { RegistryFiltersOutputSchema } from "./schema";
import { getPluginStorage, orgHandler } from "./utils";

export const COLLECTION_REGISTRY_APP_FILTERS: ServerPluginToolDefinition = {
  name: "COLLECTION_REGISTRY_APP_FILTERS",
  description: "List available tag/category filters for private registry items",
  inputSchema: z.object({}),
  outputSchema: RegistryFiltersOutputSchema,

  handler: orgHandler(z.object({}), async (_input, ctx) => {
    const storage = getPluginStorage();
    return storage.items.getFilters(ctx.organization.id);
  }),
};

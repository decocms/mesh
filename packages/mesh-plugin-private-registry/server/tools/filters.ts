import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import { RegistryFiltersOutputSchema } from "./schema";
import { getPluginStorage } from "./utils";

export const COLLECTION_REGISTRY_APP_FILTERS: ServerPluginToolDefinition = {
  name: "COLLECTION_REGISTRY_APP_FILTERS",
  description: "List available tag/category filters for private registry items",
  inputSchema: z.object({}),
  outputSchema: RegistryFiltersOutputSchema,

  handler: async (_input, ctx) => {
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
    };
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }
    await meshCtx.access.check();

    const storage = getPluginStorage();
    return storage.items.getFilters(meshCtx.organization.id);
  },
};

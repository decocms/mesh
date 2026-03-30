import { defineTool } from "@/core/define-tool";
import { requireOrganization } from "@/core/mesh-context";
import { z } from "zod";
import { RegistryFiltersOutputSchema } from "./schema";
import { getPluginStorage } from "./utils";

export const REGISTRY_ITEM_FILTERS = defineTool({
  name: "REGISTRY_ITEM_FILTERS" as const,
  description: "List available tag/category filters for private registry items",
  inputSchema: z.object({}),
  outputSchema: RegistryFiltersOutputSchema,

  handler: async (_input, ctx) => {
    const organization = requireOrganization(ctx);
    await ctx.access.check();
    const storage = getPluginStorage();
    return storage.items.getFilters(organization.id);
  },
});

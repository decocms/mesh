import { defineTool } from "@/core/define-tool";
import { requireOrganization } from "@/core/mesh-context";
import { RegistryListInputSchema, RegistryListOutputSchema } from "./schema";
import { getPluginStorage } from "./utils";

export const REGISTRY_ITEM_LIST = defineTool({
  name: "REGISTRY_ITEM_LIST" as const,
  description: "List private registry items for the current organization",
  inputSchema: RegistryListInputSchema,
  outputSchema: RegistryListOutputSchema,

  handler: async (input, ctx) => {
    const organization = requireOrganization(ctx);
    await ctx.access.check();
    const storage = getPluginStorage();
    return storage.items.list(organization.id, input);
  },
});

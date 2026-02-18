import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  RegistryUpdateInputSchema,
  RegistryUpdateOutputSchema,
} from "./schema";
import { getPluginStorage, orgHandler } from "./utils";

export const REGISTRY_ITEM_UPDATE: ServerPluginToolDefinition = {
  name: "REGISTRY_ITEM_UPDATE",
  description: "Update a private registry item",
  inputSchema: RegistryUpdateInputSchema,
  outputSchema: RegistryUpdateOutputSchema,

  handler: orgHandler(RegistryUpdateInputSchema, async (input, ctx) => {
    const storage = getPluginStorage();
    const item = await storage.items.update(
      ctx.organization.id,
      input.id,
      input.data,
    );
    return { item };
  }),
};

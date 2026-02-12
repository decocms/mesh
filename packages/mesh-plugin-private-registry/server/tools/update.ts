import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import {
  RegistryUpdateInputSchema,
  RegistryUpdateOutputSchema,
} from "./schema";
import { getPluginStorage, requireOrgContext } from "./utils";

export const COLLECTION_REGISTRY_APP_UPDATE: ServerPluginToolDefinition = {
  name: "COLLECTION_REGISTRY_APP_UPDATE",
  description: "Update a private registry item",
  inputSchema: RegistryUpdateInputSchema,
  outputSchema: RegistryUpdateOutputSchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof RegistryUpdateInputSchema>;
    const meshCtx = await requireOrgContext(ctx);
    const storage = getPluginStorage();
    const item = await storage.items.update(
      meshCtx.organization.id,
      typedInput.id,
      typedInput.data,
    );
    return { item };
  },
};

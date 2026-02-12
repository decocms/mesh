import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import {
  RegistryCreateInputSchema,
  RegistryCreateOutputSchema,
} from "./schema";
import { getPluginStorage, requireOrgContext } from "./utils";

export const COLLECTION_REGISTRY_APP_CREATE: ServerPluginToolDefinition = {
  name: "COLLECTION_REGISTRY_APP_CREATE",
  description: "Create a private registry item",
  inputSchema: RegistryCreateInputSchema,
  outputSchema: RegistryCreateOutputSchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof RegistryCreateInputSchema>;
    const meshCtx = await requireOrgContext(ctx);
    const storage = getPluginStorage();
    const item = await storage.items.create({
      ...typedInput.data,
      organization_id: meshCtx.organization.id,
      created_by: meshCtx.user?.id ?? null,
    });
    return { item };
  },
};

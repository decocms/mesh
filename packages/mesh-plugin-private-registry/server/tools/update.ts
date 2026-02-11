import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import {
  RegistryUpdateInputSchema,
  RegistryUpdateOutputSchema,
} from "./schema";
import { getPluginStorage } from "./utils";

export const COLLECTION_REGISTRY_APP_UPDATE: ServerPluginToolDefinition = {
  name: "COLLECTION_REGISTRY_APP_UPDATE",
  description: "Update a private registry item",
  inputSchema: RegistryUpdateInputSchema,
  outputSchema: RegistryUpdateOutputSchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof RegistryUpdateInputSchema>;
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
    };
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }
    await meshCtx.access.check();

    const storage = getPluginStorage();
    const item = await storage.items.update(
      meshCtx.organization.id,
      typedInput.id,
      typedInput.data,
    );
    return { item };
  },
};

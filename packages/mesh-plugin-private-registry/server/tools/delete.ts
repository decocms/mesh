import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import {
  RegistryDeleteInputSchema,
  RegistryDeleteOutputSchema,
} from "./schema";
import { getPluginStorage } from "./utils";

export const COLLECTION_REGISTRY_APP_DELETE: ServerPluginToolDefinition = {
  name: "COLLECTION_REGISTRY_APP_DELETE",
  description: "Delete a private registry item",
  inputSchema: RegistryDeleteInputSchema,
  outputSchema: RegistryDeleteOutputSchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof RegistryDeleteInputSchema>;
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
    };
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }
    await meshCtx.access.check();

    const storage = getPluginStorage();
    const item = await storage.items.delete(
      meshCtx.organization.id,
      typedInput.id,
    );
    if (!item) {
      throw new Error(`Registry item not found: ${typedInput.id}`);
    }
    return { item };
  },
};

import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import {
  RegistryCreateInputSchema,
  RegistryCreateOutputSchema,
} from "./schema";
import { getPluginStorage } from "./utils";

export const COLLECTION_REGISTRY_APP_CREATE: ServerPluginToolDefinition = {
  name: "COLLECTION_REGISTRY_APP_CREATE",
  description: "Create a private registry item",
  inputSchema: RegistryCreateInputSchema,
  outputSchema: RegistryCreateOutputSchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof RegistryCreateInputSchema>;
    const meshCtx = ctx as {
      organization: { id: string } | null;
      access: { check: () => Promise<void> };
      user?: { id?: string };
    };
    if (!meshCtx.organization) {
      throw new Error("Organization context required");
    }
    await meshCtx.access.check();

    const storage = getPluginStorage();
    const item = await storage.items.create({
      ...typedInput.data,
      organization_id: meshCtx.organization.id,
      created_by: meshCtx.user?.id ?? null,
    });
    return { item };
  },
};

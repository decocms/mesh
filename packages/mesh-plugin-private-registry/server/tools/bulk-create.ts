import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import { z } from "zod";
import {
  RegistryBulkCreateInputSchema,
  RegistryBulkCreateOutputSchema,
} from "./schema";
import { getPluginStorage } from "./utils";

export const COLLECTION_REGISTRY_APP_BULK_CREATE: ServerPluginToolDefinition = {
  name: "COLLECTION_REGISTRY_APP_BULK_CREATE",
  description: "Create many private registry items at once",
  inputSchema: RegistryBulkCreateInputSchema,
  outputSchema: RegistryBulkCreateOutputSchema,

  handler: async (input, ctx) => {
    const typedInput = input as z.infer<typeof RegistryBulkCreateInputSchema>;
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
    const errors: Array<{ id: string; error: string }> = [];
    let created = 0;

    for (const item of typedInput.items) {
      try {
        await storage.items.create({
          ...item,
          organization_id: meshCtx.organization.id,
          created_by: meshCtx.user?.id ?? null,
        });
        created += 1;
      } catch (error) {
        errors.push({
          id: item.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      created,
      errors,
    };
  },
};

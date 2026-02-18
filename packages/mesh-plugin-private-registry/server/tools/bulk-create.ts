import type { ServerPluginToolDefinition } from "@decocms/bindings/server-plugin";
import {
  RegistryBulkCreateInputSchema,
  RegistryBulkCreateOutputSchema,
} from "./schema";
import { getPluginStorage, orgHandler } from "./utils";

export const REGISTRY_ITEM_BULK_CREATE: ServerPluginToolDefinition = {
  name: "REGISTRY_ITEM_BULK_CREATE",
  description: "Create many private registry items at once",
  inputSchema: RegistryBulkCreateInputSchema,
  outputSchema: RegistryBulkCreateOutputSchema,

  handler: orgHandler(RegistryBulkCreateInputSchema, async (input, ctx) => {
    const storage = getPluginStorage();
    const errors: Array<{ id: string; error: string }> = [];
    let created = 0;

    for (const item of input.items) {
      try {
        await storage.items.create({
          ...item,
          organization_id: ctx.organization.id,
          created_by: ctx.auth.user?.id ?? null,
        });
        created += 1;
      } catch (error) {
        errors.push({
          id: item.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return { created, errors };
  }),
};

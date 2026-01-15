/**
 * COLLECTION_RESOURCES_DELETE Tool
 *
 * Delete a stored resource with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { ResourceEntitySchema } from "./schema";

const DeleteInputSchema = z.object({
  id: z.string().describe("ID of the resource to delete"),
});

const DeleteOutputSchema = z.object({
  item: ResourceEntitySchema.describe("The deleted resource entity"),
});

export const COLLECTION_RESOURCES_DELETE = defineTool({
  name: "COLLECTION_RESOURCES_DELETE",
  description: "Delete a stored resource",
  inputSchema: DeleteInputSchema,
  outputSchema: DeleteOutputSchema,
  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    const existing = await ctx.storage.resources.findById(input.id);
    if (!existing || existing.organization_id !== organization.id) {
      throw new Error("Resource not found");
    }

    await ctx.storage.resources.delete(input.id);
    return { item: existing };
  },
});

/**
 * COLLECTION_RESOURCES_UPDATE Tool
 *
 * Update a stored resource with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { ResourceEntitySchema, ResourceUpdateDataSchema } from "./schema";

const UpdateInputSchema = z.object({
  id: z.string().describe("ID of the resource to update"),
  data: ResourceUpdateDataSchema.describe("Partial resource data to update"),
});

const UpdateOutputSchema = z.object({
  item: ResourceEntitySchema.describe("The updated resource entity"),
});

export const COLLECTION_RESOURCES_UPDATE = defineTool({
  name: "COLLECTION_RESOURCES_UPDATE",
  description: "Update a stored resource",
  inputSchema: UpdateInputSchema,
  outputSchema: UpdateOutputSchema,
  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    const existing = await ctx.storage.resources.findById(input.id);
    if (!existing || existing.organization_id !== organization.id) {
      throw new Error("Resource not found");
    }

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required to update resource");
    }

    const resource = await ctx.storage.resources.update(
      input.id,
      userId,
      input.data,
    );
    return { item: resource };
  },
});

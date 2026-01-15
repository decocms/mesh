/**
 * COLLECTION_RESOURCES_GET Tool
 *
 * Get a stored resource by ID with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { ResourceEntitySchema } from "./schema";

const GetInputSchema = z.object({
  id: z.string().describe("ID of the resource to retrieve"),
});

const GetOutputSchema = z.object({
  item: ResourceEntitySchema.nullable().describe(
    "The retrieved resource, or null if not found",
  ),
});

export const COLLECTION_RESOURCES_GET = defineTool({
  name: "COLLECTION_RESOURCES_GET",
  description: "Get a stored resource by ID",
  inputSchema: GetInputSchema,
  outputSchema: GetOutputSchema,
  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    const resource = await ctx.storage.resources.findById(input.id);
    if (resource && resource.organization_id !== organization.id) {
      return { item: null };
    }
    return { item: resource ?? null };
  },
});

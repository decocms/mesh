/**
 * COLLECTION_RESOURCES_CREATE Tool
 *
 * Create a stored resource (organization-scoped) with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { ResourceCreateDataSchema, ResourceEntitySchema } from "./schema";

const CreateInputSchema = z.object({
  data: ResourceCreateDataSchema.describe("Data for the new resource"),
});

const CreateOutputSchema = z.object({
  item: ResourceEntitySchema.describe("The created resource entity"),
});

export const COLLECTION_RESOURCES_CREATE = defineTool({
  name: "COLLECTION_RESOURCES_CREATE",
  description: "Create a new stored resource in the organization",
  inputSchema: CreateInputSchema,
  outputSchema: CreateOutputSchema,
  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required to create resource");
    }

    const resource = await ctx.storage.resources.create(
      organization.id,
      userId,
      input.data,
    );

    return { item: resource };
  },
});

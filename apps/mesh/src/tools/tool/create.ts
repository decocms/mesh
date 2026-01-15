/**
 * COLLECTION_TOOLS_CREATE Tool
 *
 * Create a stored tool (organization-scoped) with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { ToolCreateDataSchema, ToolEntitySchema } from "./schema";

const CreateInputSchema = z.object({
  data: ToolCreateDataSchema.describe("Data for the new tool"),
});

const CreateOutputSchema = z.object({
  item: ToolEntitySchema.describe("The created tool entity"),
});

export const COLLECTION_TOOLS_CREATE = defineTool({
  name: "COLLECTION_TOOLS_CREATE",
  description: "Create a new stored tool in the organization",
  inputSchema: CreateInputSchema,
  outputSchema: CreateOutputSchema,
  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required to create tool");
    }

    const tool = await ctx.storage.tools.create(
      organization.id,
      userId,
      input.data,
    );

    return { item: tool };
  },
});

/**
 * COLLECTION_TOOLS_UPDATE Tool
 *
 * Update a stored tool with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { ToolEntitySchema, ToolUpdateDataSchema } from "./schema";

const UpdateInputSchema = z.object({
  id: z.string().describe("ID of the tool to update"),
  data: ToolUpdateDataSchema.describe("Partial tool data to update"),
});

const UpdateOutputSchema = z.object({
  item: ToolEntitySchema.describe("The updated tool entity"),
});

export const COLLECTION_TOOLS_UPDATE = defineTool({
  name: "COLLECTION_TOOLS_UPDATE",
  description: "Update a stored tool",
  inputSchema: UpdateInputSchema,
  outputSchema: UpdateOutputSchema,
  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    const existing = await ctx.storage.tools.findById(input.id);
    if (!existing || existing.organization_id !== organization.id) {
      throw new Error("Tool not found");
    }

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required to update tool");
    }

    const tool = await ctx.storage.tools.update(input.id, userId, input.data);
    return { item: tool };
  },
});

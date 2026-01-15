/**
 * COLLECTION_TOOLS_DELETE Tool
 *
 * Delete a stored tool with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { ToolEntitySchema } from "./schema";

const DeleteInputSchema = z.object({
  id: z.string().describe("ID of the tool to delete"),
});

const DeleteOutputSchema = z.object({
  item: ToolEntitySchema.describe("The deleted tool entity"),
});

export const COLLECTION_TOOLS_DELETE = defineTool({
  name: "COLLECTION_TOOLS_DELETE",
  description: "Delete a stored tool",
  inputSchema: DeleteInputSchema,
  outputSchema: DeleteOutputSchema,
  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    const existing = await ctx.storage.tools.findById(input.id);
    if (!existing || existing.organization_id !== organization.id) {
      throw new Error("Tool not found");
    }

    await ctx.storage.tools.delete(input.id);
    return { item: existing };
  },
});

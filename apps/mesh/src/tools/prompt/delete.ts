/**
 * COLLECTION_PROMPTS_DELETE Tool
 *
 * Delete a stored prompt with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { PromptEntitySchema } from "./schema";

const DeleteInputSchema = z.object({
  id: z.string().describe("ID of the prompt to delete"),
});

const DeleteOutputSchema = z.object({
  item: PromptEntitySchema.describe("The deleted prompt entity"),
});

export const COLLECTION_PROMPTS_DELETE = defineTool({
  name: "COLLECTION_PROMPTS_DELETE",
  description: "Delete a stored prompt",
  inputSchema: DeleteInputSchema,
  outputSchema: DeleteOutputSchema,
  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    const existing = await ctx.storage.prompts.findById(input.id);
    if (!existing || existing.organization_id !== organization.id) {
      throw new Error("Prompt not found");
    }

    await ctx.storage.prompts.delete(input.id);
    return { item: existing };
  },
});

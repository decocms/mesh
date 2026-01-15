/**
 * COLLECTION_PROMPTS_UPDATE Tool
 *
 * Update a stored prompt with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { PromptEntitySchema, PromptUpdateDataSchema } from "./schema";

const UpdateInputSchema = z.object({
  id: z.string().describe("ID of the prompt to update"),
  data: PromptUpdateDataSchema.describe("Partial prompt data to update"),
});

const UpdateOutputSchema = z.object({
  item: PromptEntitySchema.describe("The updated prompt entity"),
});

export const COLLECTION_PROMPTS_UPDATE = defineTool({
  name: "COLLECTION_PROMPTS_UPDATE",
  description: "Update a stored prompt",
  inputSchema: UpdateInputSchema,
  outputSchema: UpdateOutputSchema,
  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    const existing = await ctx.storage.prompts.findById(input.id);
    if (!existing || existing.organization_id !== organization.id) {
      throw new Error("Prompt not found");
    }

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required to update prompt");
    }

    const prompt = await ctx.storage.prompts.update(
      input.id,
      userId,
      input.data,
    );
    return { item: prompt };
  },
});

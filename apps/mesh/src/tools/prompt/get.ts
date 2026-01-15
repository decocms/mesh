/**
 * COLLECTION_PROMPTS_GET Tool
 *
 * Get a stored prompt by ID with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { PromptEntitySchema } from "./schema";

const GetInputSchema = z.object({
  id: z.string().describe("ID of the prompt to retrieve"),
});

const GetOutputSchema = z.object({
  item: PromptEntitySchema.nullable().describe(
    "The retrieved prompt, or null if not found",
  ),
});

export const COLLECTION_PROMPTS_GET = defineTool({
  name: "COLLECTION_PROMPTS_GET",
  description: "Get a stored prompt by ID",
  inputSchema: GetInputSchema,
  outputSchema: GetOutputSchema,
  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    const prompt = await ctx.storage.prompts.findById(input.id);
    if (prompt && prompt.organization_id !== organization.id) {
      return { item: null };
    }
    return { item: prompt ?? null };
  },
});

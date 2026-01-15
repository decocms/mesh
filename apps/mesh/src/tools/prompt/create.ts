/**
 * COLLECTION_PROMPTS_CREATE Tool
 *
 * Create a stored prompt (organization-scoped) with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { PromptCreateDataSchema, PromptEntitySchema } from "./schema";

const CreateInputSchema = z.object({
  data: PromptCreateDataSchema.describe("Data for the new prompt"),
});

const CreateOutputSchema = z.object({
  item: PromptEntitySchema.describe("The created prompt entity"),
});

export const COLLECTION_PROMPTS_CREATE = defineTool({
  name: "COLLECTION_PROMPTS_CREATE",
  description: "Create a new stored prompt in the organization",
  inputSchema: CreateInputSchema,
  outputSchema: CreateOutputSchema,
  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);
    await ctx.access.check();

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required to create prompt");
    }

    const prompt = await ctx.storage.prompts.create(
      organization.id,
      userId,
      input.data,
    );

    return { item: prompt };
  },
});

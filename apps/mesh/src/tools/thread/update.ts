/**
 * COLLECTION_THREADS_UPDATE Tool
 *
 * Update an existing thread (organization-scoped) with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { ThreadEntitySchema, ThreadUpdateDataSchema } from "./schema";

/**
 * Input schema for updating threads
 */
const UpdateInputSchema = z.object({
  id: z.string().describe("ID of the thread to update"),
  data: ThreadUpdateDataSchema.describe("Partial thread data to update"),
});

/**
 * Output schema for updated thread
 */
const UpdateOutputSchema = z.object({
  item: ThreadEntitySchema.describe("The updated thread entity"),
});

export const COLLECTION_THREADS_UPDATE = defineTool({
  name: "COLLECTION_THREADS_UPDATE",
  description: "Update an existing thread in the organization",

  inputSchema: UpdateInputSchema,
  outputSchema: UpdateOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);

    await ctx.access.check();

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required to update thread");
    }

    const { id, data } = input;

    // First fetch the thread to verify ownership before updating
    const existing = await ctx.storage.threads.get(id);

    // Verify it exists and belongs to the current organization
    if (!existing || existing.organizationId !== organization.id) {
      throw new Error("Thread not found in organization");
    }

    const thread = await ctx.storage.threads.update(id, {
      title: data.title,
      description: data.description,
      hidden: data.hidden,
      updatedBy: userId,
    });

    return {
      item: {
        ...thread,
        hidden: thread.hidden ?? false,
      },
    };
  },
});

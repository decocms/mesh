/**
 * COLLECTION_THREADS_LIST Tool
 *
 * List all threads in the organization with collection binding compliance.
 * Supports filtering, sorting, and pagination.
 */

import {
  CollectionListInputSchema,
  createCollectionListOutputSchema,
} from "@decocms/bindings/collections";
import { defineTool } from "../../core/define-tool";
import { requireOrganization } from "../../core/mesh-context";
import { ThreadEntitySchema } from "./schema";
import { z } from "zod";

const ThreadListInputSchema = CollectionListInputSchema.extend({
  where: z
    .object({
      created_by: z.string().optional(),
    })
    .optional(),
});

/**
 * Output schema using the ThreadEntitySchema
 */
const ThreadListOutputSchema =
  createCollectionListOutputSchema(ThreadEntitySchema);

export const COLLECTION_THREADS_LIST = defineTool({
  name: "COLLECTION_THREADS_LIST",
  description:
    "List all threads in the organization with filtering, sorting, and pagination",

  inputSchema: ThreadListInputSchema,
  outputSchema: ThreadListOutputSchema,

  handler: async (input, ctx) => {
    await ctx.access.check();
    const userId = ctx.auth.user?.id;
    if (!userId) {
      throw new Error("User ID required to list threads");
    }
    const organization = requireOrganization(ctx);
    const { threads, total } = await ctx.storage.threads.list(
      organization.id,
      userId,
      { limit: input.limit, offset: input.offset },
    );

    // Calculate pagination
    const offset = input.offset ?? 0;
    const limit = input.limit ?? 100;
    const paginatedThreads = threads.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return {
      items: paginatedThreads.map((thread) => ({
        ...thread,
        hidden: thread.hidden ?? false,
      })),
      totalCount: total,
      hasMore,
    };
  },
});

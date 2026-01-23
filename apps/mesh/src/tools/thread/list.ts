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
    try {
      await ctx.access.check();
    } catch (error) {
      // Debug: log access check error
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console
        console.error("[COLLECTION_THREADS_LIST] Access check failed:", {
          error: error instanceof Error ? error.message : String(error),
          userId: ctx.auth.user?.id,
          hasUser: !!ctx.auth.user,
          hasApiKey: !!ctx.auth.apiKey,
        });
      }
      throw error;
    }

    const userId = ctx.auth.user?.id;
    if (!userId) {
      throw new Error("User ID required to list threads");
    }
    const organization = requireOrganization(ctx);
    const offset = input.offset ?? 0;
    const limit = input.limit ?? 100;

    const { threads, total } = await ctx.storage.threads.list(
      organization.id,
      userId,
      { limit, offset },
    );

    // Debug: log query results
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("[COLLECTION_THREADS_LIST] Query:", {
        organizationId: organization.id,
        userId,
        threadsFound: threads.length,
        total,
        offset,
        limit,
      });
    }

    const hasMore = offset + limit < total;

    return {
      items: threads.map((thread) => ({
        ...thread,
        hidden: thread.hidden ?? false,
      })),
      totalCount: total,
      hasMore,
    };
  },
});

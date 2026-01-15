/**
 * COLLECTION_THREADS_GET Tool
 *
 * Get thread details by ID with collection binding compliance.
 */

import {
  CollectionGetInputSchema,
  createCollectionGetOutputSchema,
} from "@decocms/bindings/collections";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { ThreadEntitySchema } from "./schema";

/**
 * Output schema using the ThreadEntitySchema
 */
const ThreadGetOutputSchema =
  createCollectionGetOutputSchema(ThreadEntitySchema);

export const COLLECTION_THREADS_GET = defineTool({
  name: "COLLECTION_THREADS_GET",
  description: "Get thread details by ID",

  inputSchema: CollectionGetInputSchema,
  outputSchema: ThreadGetOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);

    await ctx.access.check();

    const thread = await ctx.storage.threads.get(input.id);

    // Verify thread exists and belongs to the current organization
    if (!thread || thread.organizationId !== organization.id) {
      return { item: null };
    }

    return {
      item: thread,
    };
  },
});

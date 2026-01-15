/**
 * COLLECTION_THREADS_DELETE Tool
 *
 * Delete a thread with collection binding compliance.
 */

import {
  CollectionDeleteInputSchema,
  createCollectionDeleteOutputSchema,
} from "@decocms/bindings/collections";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { ThreadEntitySchema } from "./schema";

export const COLLECTION_THREADS_DELETE = defineTool({
  name: "COLLECTION_THREADS_DELETE",
  description: "Delete a thread",

  inputSchema: CollectionDeleteInputSchema,
  outputSchema: createCollectionDeleteOutputSchema(ThreadEntitySchema),

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);

    await ctx.access.check();

    // Fetch thread before deleting to return the entity
    const thread = await ctx.storage.threads.get(input.id);
    if (!thread) {
      throw new Error(`Thread not found: ${input.id}`);
    }

    // Verify it belongs to the current organization
    // Use same error message as "not found" to prevent ID enumeration
    if (thread.organizationId !== organization.id) {
      throw new Error(`Thread not found: ${input.id}`);
    }

    // Delete thread
    await ctx.storage.threads.delete(input.id);

    return {
      item: thread,
    };
  },
});

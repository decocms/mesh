/**
 * COLLECTION_CONNECTIONS_DELETE Tool
 *
 * Delete a connection with collection binding compliance.
 */

import {
  CollectionDeleteInputSchema,
  createCollectionDeleteOutputSchema,
} from "@decocms/bindings/collections";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { ConnectionEntitySchema } from "./schema";

export const COLLECTION_CONNECTIONS_DELETE = defineTool({
  name: "COLLECTION_CONNECTIONS_DELETE",
  description: "Delete a connection",

  inputSchema: CollectionDeleteInputSchema,
  outputSchema: createCollectionDeleteOutputSchema(ConnectionEntitySchema),

  handler: async (input, ctx) => {
    // Require authentication
    requireAuth(ctx);

    // Require organization context
    const organization = requireOrganization(ctx);

    // Check authorization
    await ctx.access.check();

    // Fetch connection before deleting to return the entity
    const connection = await ctx.storage.connections.findById(input.id);
    if (!connection) {
      throw new Error(`Connection not found: ${input.id}`);
    }

    // Verify it belongs to the current organization
    if (connection.organization_id !== organization.id) {
      throw new Error("Connection not found in organization");
    }

    // Block deletion of fixed system connections (e.g., dev-assets in dev mode)
    const metadata = connection.metadata as Record<string, unknown> | null;
    if (metadata?.isFixed === true) {
      throw new Error(
        "This connection is a fixed system connection and cannot be deleted",
      );
    }

    // Delete connection
    await ctx.storage.connections.delete(input.id);

    return {
      item: connection,
    };
  },
});

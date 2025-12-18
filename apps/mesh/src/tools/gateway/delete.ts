/**
 * COLLECTION_GATEWAY_DELETE Tool
 *
 * Delete a gateway with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { GatewayEntitySchema } from "./schema";

/**
 * Input schema for deleting a gateway
 */
const DeleteInputSchema = z.object({
  id: z.string().describe("ID of the gateway to delete"),
});

export type DeleteGatewayInput = z.infer<typeof DeleteInputSchema>;

/**
 * Output schema for gateway delete
 */
const DeleteOutputSchema = z.object({
  item: GatewayEntitySchema.describe("The deleted gateway entity"),
});

export const COLLECTION_GATEWAY_DELETE = defineTool({
  name: "COLLECTION_GATEWAY_DELETE",
  description: "Delete an MCP gateway",

  inputSchema: DeleteInputSchema,
  outputSchema: DeleteOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);

    await ctx.access.check();

    // Get the gateway before deleting (to return it)
    const existing = await ctx.storage.gateways.findById(input.id);
    if (!existing) {
      throw new Error(`Gateway not found: ${input.id}`);
    }
    if (existing.organizationId !== organization.id) {
      throw new Error(`Gateway not found: ${input.id}`);
    }

    // Delete the gateway (connections are deleted via CASCADE)
    await ctx.storage.gateways.delete(input.id);

    // Transform to entity format
    return {
      item: {
        id: existing.id,
        title: existing.title,
        description: existing.description,
        organization_id: existing.organizationId,
        mode: existing.mode,
        status: existing.status,
        connections: existing.connections.map((conn) => ({
          connection_id: conn.connectionId,
          selected_tools: conn.selectedTools,
        })),
        created_at: existing.createdAt as string,
        updated_at: existing.updatedAt as string,
        created_by: existing.createdBy,
        updated_by: existing.updatedBy,
      },
    };
  },
});

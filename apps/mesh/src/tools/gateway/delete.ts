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
    if (existing.organization_id !== organization.id) {
      throw new Error(`Gateway not found: ${input.id}`);
    }

    // Delete the gateway (connections are deleted via CASCADE)
    await ctx.storage.gateways.delete(input.id);

    // Return gateway entity directly (already in correct format)
    return {
      item: existing,
    };
  },
});

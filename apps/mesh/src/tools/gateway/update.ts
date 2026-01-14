/**
 * COLLECTION_GATEWAY_UPDATE Tool
 *
 * Update an existing gateway with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { GatewayEntitySchema, GatewayUpdateDataSchema } from "./schema";

/**
 * Input schema for updating a gateway
 */
const UpdateInputSchema = z.object({
  id: z.string().describe("ID of the gateway to update"),
  data: GatewayUpdateDataSchema.describe("Partial gateway data to update"),
});

export type UpdateGatewayInput = z.infer<typeof UpdateInputSchema>;

/**
 * Output schema for gateway update
 */
const UpdateOutputSchema = z.object({
  item: GatewayEntitySchema.describe("The updated gateway entity"),
});

export const COLLECTION_GATEWAY_UPDATE = defineTool({
  name: "COLLECTION_GATEWAY_UPDATE",
  description: "Update an MCP gateway",

  inputSchema: UpdateInputSchema,
  outputSchema: UpdateOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);

    await ctx.access.check();

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required to update gateway");
    }

    // Check the gateway exists and belongs to the organization
    const existing = await ctx.storage.gateways.findById(input.id);
    if (!existing) {
      throw new Error(`Gateway not found: ${input.id}`);
    }
    if (existing.organization_id !== organization.id) {
      throw new Error(`Gateway not found: ${input.id}`);
    }

    // Update the gateway (input.data is already in the correct format)
    const gateway = await ctx.storage.gateways.update(
      input.id,
      userId,
      input.data,
    );

    // Return gateway entity directly (already in correct format)
    return {
      item: gateway,
    };
  },
});

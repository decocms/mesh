/**
 * COLLECTION_GATEWAY_CREATE Tool
 *
 * Create a new MCP gateway (organization-scoped) with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { GatewayCreateDataSchema, GatewayEntitySchema } from "./schema";

/**
 * Input schema for creating gateways (wrapped in data field for collection compliance)
 */
const CreateInputSchema = z.object({
  data: GatewayCreateDataSchema.describe("Data for the new gateway"),
});

export type CreateGatewayInput = z.infer<typeof CreateInputSchema>;

/**
 * Output schema for created gateway
 */
const CreateOutputSchema = z.object({
  item: GatewayEntitySchema.describe("The created gateway entity"),
});

export const COLLECTION_GATEWAY_CREATE = defineTool({
  name: "COLLECTION_GATEWAY_CREATE",
  description: "Create a new MCP gateway in the organization",

  inputSchema: CreateInputSchema,
  outputSchema: CreateOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);

    await ctx.access.check();

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required to create gateway");
    }

    // Create the gateway (input.data is already in the correct format)
    const gateway = await ctx.storage.gateways.create(
      organization.id,
      userId,
      input.data,
    );

    // Return gateway entity directly (already in correct format)
    return {
      item: gateway,
    };
  },
});

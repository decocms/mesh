/**
 * COLLECTION_GATEWAY_GET Tool
 *
 * Get a single gateway by ID with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { GatewayEntitySchema } from "./schema";

/**
 * Input schema for getting a gateway
 */
const GetInputSchema = z.object({
  id: z.string().describe("ID of the gateway to retrieve"),
});

export type GetGatewayInput = z.infer<typeof GetInputSchema>;

/**
 * Output schema for gateway get
 */
const GetOutputSchema = z.object({
  item: GatewayEntitySchema.nullable().describe(
    "The retrieved gateway, or null if not found",
  ),
});

export const COLLECTION_GATEWAY_GET = defineTool({
  name: "COLLECTION_GATEWAY_GET",
  description: "Get an MCP gateway by ID",

  inputSchema: GetInputSchema,
  outputSchema: GetOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);

    await ctx.access.check();

    // Get the gateway
    const gateway = await ctx.storage.gateways.findById(input.id);

    // Check organization ownership
    if (gateway && gateway.organization_id !== organization.id) {
      // Don't leak existence of gateways in other organizations
      return { item: null };
    }

    if (!gateway) {
      return { item: null };
    }

    // Return gateway entity directly (already in correct format)
    return {
      item: gateway,
    };
  },
});

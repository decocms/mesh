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
    if (gateway && gateway.organizationId !== organization.id) {
      // Don't leak existence of gateways in other organizations
      return { item: null };
    }

    if (!gateway) {
      return { item: null };
    }

    // Transform to entity format
    return {
      item: {
        id: gateway.id,
        title: gateway.title,
        description: gateway.description,
        icon: gateway.icon,
        organization_id: gateway.organizationId,
        tool_selection_strategy: gateway.toolSelectionStrategy,
        tool_selection_mode: gateway.toolSelectionMode,
        status: gateway.status,
        is_default: gateway.isDefault,
        connections: gateway.connections.map((conn) => ({
          connection_id: conn.connectionId,
          selected_tools: conn.selectedTools,
        })),
        created_at: gateway.createdAt as string,
        updated_at: gateway.updatedAt as string,
        created_by: gateway.createdBy,
        updated_by: gateway.updatedBy ?? undefined,
      },
    };
  },
});

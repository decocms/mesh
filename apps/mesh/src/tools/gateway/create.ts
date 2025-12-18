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

    // Transform input to storage format
    const gatewayData = {
      title: input.data.title,
      description: input.data.description ?? null,
      mode: input.data.mode,
      status: input.data.status,
      connections: input.data.connections.map((conn) => ({
        connectionId: conn.connection_id,
        selectedTools: conn.selected_tools ?? null,
      })),
    };

    // Create the gateway
    const gateway = await ctx.storage.gateways.create(
      organization.id,
      userId,
      gatewayData,
    );

    // Transform to entity format
    return {
      item: {
        id: gateway.id,
        title: gateway.title,
        description: gateway.description,
        organization_id: gateway.organizationId,
        mode: gateway.mode,
        status: gateway.status,
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

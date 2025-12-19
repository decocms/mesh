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
    if (existing.organizationId !== organization.id) {
      throw new Error(`Gateway not found: ${input.id}`);
    }

    // Transform input to storage format
    const updateData: Parameters<typeof ctx.storage.gateways.update>[2] = {};

    if (input.data.title !== undefined) {
      updateData.title = input.data.title;
    }
    if (input.data.description !== undefined) {
      updateData.description = input.data.description;
    }
    if (input.data.tool_selection_strategy !== undefined) {
      updateData.toolSelectionStrategy = input.data.tool_selection_strategy;
    }
    if (input.data.tool_selection_mode !== undefined) {
      updateData.toolSelectionMode = input.data.tool_selection_mode;
    }
    if (input.data.icon !== undefined) {
      updateData.icon = input.data.icon;
    }
    if (input.data.status !== undefined) {
      updateData.status = input.data.status;
    }
    if (input.data.is_default !== undefined) {
      updateData.isDefault = input.data.is_default;
    }
    if (input.data.connections !== undefined) {
      updateData.connections = input.data.connections.map((conn) => ({
        connectionId: conn.connection_id,
        selectedTools: conn.selected_tools ?? null,
      }));
    }

    // Update the gateway
    const gateway = await ctx.storage.gateways.update(
      input.id,
      userId,
      updateData,
    );

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

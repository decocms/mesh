/**
 * COLLECTION_GATEWAY_LIST Tool
 *
 * List all gateways for the organization with collection binding compliance.
 */

import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { GatewayEntitySchema } from "./schema";

/**
 * Input schema for listing gateways
 */
const ListInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe("Maximum number of items to return"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of items to skip"),
});

export type ListGatewaysInput = z.infer<typeof ListInputSchema>;

/**
 * Output schema for gateway list
 */
const ListOutputSchema = z.object({
  items: z.array(GatewayEntitySchema).describe("Array of gateway items"),
  totalCount: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Total number of matching items"),
  hasMore: z.boolean().optional().describe("Whether there are more items"),
});

export const COLLECTION_GATEWAY_LIST = defineTool({
  name: "COLLECTION_GATEWAY_LIST",
  description: "List all MCP gateways in the organization",

  inputSchema: ListInputSchema,
  outputSchema: ListOutputSchema,

  handler: async (input, ctx) => {
    requireAuth(ctx);
    const organization = requireOrganization(ctx);

    await ctx.access.check();

    // Get all gateways for the organization
    const gateways = await ctx.storage.gateways.list(organization.id);

    // Apply pagination if specified
    const offset = input.offset ?? 0;
    const limit = input.limit ?? gateways.length;
    const paginatedGateways = gateways.slice(offset, offset + limit);

    // Transform to entity format
    return {
      items: paginatedGateways.map((gateway) => ({
        id: gateway.id,
        title: gateway.title,
        description: gateway.description,
        organization_id: gateway.organizationId,
        tool_selection_strategy: gateway.toolSelectionStrategy,
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
      })),
      totalCount: gateways.length,
      hasMore: offset + limit < gateways.length,
    };
  },
});

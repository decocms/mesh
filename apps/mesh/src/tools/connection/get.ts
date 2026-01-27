/**
 * COLLECTION_CONNECTIONS_GET Tool
 *
 * Get connection details by ID with collection binding compliance.
 */

import {
  CollectionGetInputSchema,
  createCollectionGetOutputSchema,
} from "@decocms/bindings/collections";
import { OBJECT_STORAGE_BINDING } from "@decocms/bindings/object-storage";
import {
  getWellKnownDevAssetsConnection,
  WellKnownOrgMCPId,
} from "@decocms/mesh-sdk";
import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import { requireOrganization } from "../../core/mesh-context";
import {
  type ConnectionEntity,
  ConnectionEntitySchema,
  type ToolDefinition,
} from "./schema";

/**
 * Check if we're running in dev mode
 */
function isDevMode(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Create a dev-assets connection entity for local file storage.
 */
function createDevAssetsConnectionEntity(
  orgId: string,
  baseUrl: string,
): ConnectionEntity {
  const connectionData = getWellKnownDevAssetsConnection(baseUrl, orgId);

  const tools: ToolDefinition[] = OBJECT_STORAGE_BINDING.map(
    (binding: (typeof OBJECT_STORAGE_BINDING)[number]) => ({
      name: binding.name,
      description: `${binding.name} operation for local file storage`,
      inputSchema: z.toJSONSchema(binding.inputSchema) as Record<
        string,
        unknown
      >,
      outputSchema: z.toJSONSchema(binding.outputSchema) as Record<
        string,
        unknown
      >,
    }),
  );

  const now = new Date().toISOString();

  return {
    id: connectionData.id ?? WellKnownOrgMCPId.DEV_ASSETS(orgId),
    title: connectionData.title,
    description: connectionData.description ?? null,
    icon: connectionData.icon ?? null,
    app_name: connectionData.app_name ?? null,
    app_id: connectionData.app_id ?? null,
    organization_id: orgId,
    created_by: "system",
    created_at: now,
    updated_at: now,
    connection_type: connectionData.connection_type,
    connection_url: connectionData.connection_url ?? null,
    connection_token: null,
    connection_headers: null,
    oauth_config: null,
    configuration_state: null,
    configuration_scopes: null,
    metadata: connectionData.metadata ?? null,
    tools,
    bindings: ["OBJECT_STORAGE"],
    status: "active",
  };
}

/**
 * Output schema using the ConnectionEntitySchema
 */
const ConnectionGetOutputSchema = createCollectionGetOutputSchema(
  ConnectionEntitySchema,
);

export const COLLECTION_CONNECTIONS_GET = defineTool({
  name: "COLLECTION_CONNECTIONS_GET",
  description: "Get connection details by ID",

  inputSchema: CollectionGetInputSchema,
  outputSchema: ConnectionGetOutputSchema,

  handler: async (input, ctx) => {
    // Require organization context
    const organization = requireOrganization(ctx);

    // Check authorization
    await ctx.access.check();

    // In dev mode, check if this is the dev-assets connection
    if (isDevMode()) {
      const devAssetsId = WellKnownOrgMCPId.DEV_ASSETS(organization.id);
      if (input.id === devAssetsId) {
        const baseUrl = process.env.BASE_URL || "http://localhost:3000";
        return {
          item: createDevAssetsConnectionEntity(organization.id, baseUrl),
        };
      }
    }

    // Get connection from database
    const connection = await ctx.storage.connections.findById(input.id);

    // Verify connection exists and belongs to the current organization
    if (!connection || connection.organization_id !== organization.id) {
      return { item: null };
    }

    return {
      item: connection,
    };
  },
});

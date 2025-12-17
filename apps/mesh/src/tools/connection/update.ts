/**
 * COLLECTION_CONNECTIONS_UPDATE Tool
 *
 * Update an existing MCP connection (organization-scoped) with collection binding compliance.
 * Also handles MCP configuration state and scopes validation.
 */

import { WellKnownMCPId } from "@/core/well-known-mcp";
import { z } from "zod";
import { createMCPProxy } from "../../api/routes/proxy";
import { defineTool } from "../../core/define-tool";
import { requireAuth, requireOrganization } from "../../core/mesh-context";
import { fetchToolsFromMCP } from "./fetch-tools";
import {
  type ConnectionEntity,
  ConnectionEntitySchema,
  ConnectionUpdateDataSchema,
} from "./schema";
import { prop } from "./json-path";

/**
 * Input schema for updating connections
 */
const UpdateInputSchema = z.object({
  id: z.string().describe("ID of the connection to update"),
  data: ConnectionUpdateDataSchema.describe(
    "Partial connection data to update",
  ),
});

/**
 * Output schema for updated connection
 */
const UpdateOutputSchema = z.object({
  item: ConnectionEntitySchema.describe("The updated connection entity"),
});

/**
 * Parse scope string to extract key and scope parts
 */
function parseScope(scope: string): [string, string] {
  const parts = scope.split("::");
  if (
    parts.length !== 2 ||
    typeof parts[0] !== "string" ||
    typeof parts[1] !== "string"
  ) {
    throw new Error(
      `Invalid scope format: ${scope}. Expected format: "KEY::SCOPE"`,
    );
  }
  return parts as [string, string];
}

/**
 * Validate configuration state and scopes, checking referenced connections
 */
async function validateConfiguration(
  state: Record<string, unknown>,
  scopes: string[],
  organizationId: string,
  ctx: Parameters<typeof COLLECTION_CONNECTIONS_UPDATE.execute>[1],
): Promise<void> {
  const referencedConnections = new Set<string>();

  for (const scope of scopes) {
    // Parse scope format: "KEY::SCOPE"
    const [key] = parseScope(scope);
    const value = prop(key, state);

    // Check if this key exists in state
    if (!value) {
      throw new Error(
        `Scope references key "${key}" but it's not present in state`,
      );
    }

    // Extract connection ID from state
    const stateValue = state[key];
    if (
      typeof stateValue === "object" &&
      stateValue !== null &&
      "value" in stateValue
    ) {
      const connectionIdRef = (stateValue as { value: unknown }).value;
      if (typeof connectionIdRef === "string") {
        referencedConnections.add(connectionIdRef);
      }
    }
  }

  // Validate all referenced connections
  for (const refConnectionId of referencedConnections) {
    if (refConnectionId === WellKnownMCPId.SELF) {
      continue;
    }
    // Verify connection exists
    const refConnection =
      await ctx.storage.connections.findById(refConnectionId);
    if (!refConnection) {
      throw new Error(`Referenced connection not found: ${refConnectionId}`);
    }

    // Verify connection belongs to same organization
    if (refConnection.organization_id !== organizationId) {
      throw new Error(
        `Referenced connection ${refConnectionId} does not belong to organization ${organizationId}`,
      );
    }

    // Verify user has access to the referenced connection
    try {
      await ctx.access.check(refConnectionId);
    } catch (error) {
      throw new Error(
        `Access denied to referenced connection: ${refConnectionId}. ${
          (error as Error).message
        }`,
      );
    }
  }
}

export const COLLECTION_CONNECTIONS_UPDATE = defineTool({
  name: "COLLECTION_CONNECTIONS_UPDATE",
  description: "Update an existing MCP connection in the organization",

  inputSchema: UpdateInputSchema,
  outputSchema: UpdateOutputSchema,

  handler: async (input, ctx) => {
    // Require authentication
    requireAuth(ctx);

    // Require organization context
    const organization = requireOrganization(ctx);

    // Check authorization
    await ctx.access.check();

    const { id, data } = input;

    // First fetch the connection to verify ownership before updating
    const existing = await ctx.storage.connections.findById(id);

    // Verify it exists and belongs to the current organization
    if (!existing || existing.organization_id !== organization.id) {
      throw new Error("Connection not found in organization");
    }

    // Handle MCP configuration state and scopes if present
    let finalState = data.configuration_state ?? existing.configuration_state;
    let finalScopes =
      data.configuration_scopes ?? existing.configuration_scopes ?? [];

    // If configuration fields are being updated, validate them
    if (
      data.configuration_state !== undefined ||
      data.configuration_scopes !== undefined
    ) {
      // Merge state: use provided state, or keep existing
      if (data.configuration_state !== undefined) {
        finalState = data.configuration_state;
      } else if (finalState === null) {
        finalState = {};
      }

      // Use provided scopes or existing ones
      if (data.configuration_scopes !== undefined) {
        finalScopes = data.configuration_scopes ?? [];
      }

      // Validate configuration if we have scopes
      if (finalScopes.length > 0 && finalState) {
        await validateConfiguration(
          finalState as Record<string, unknown>,
          finalScopes,
          organization.id,
          ctx,
        );
      }
    }

    // Fetch tools from the MCP server
    const fetchedTools = await fetchToolsFromMCP({
      id: existing.id,
      title: data.title ?? existing.title,
      connection_url: data.connection_url ?? existing.connection_url,
      connection_token: data.connection_token ?? existing.connection_token,
      connection_headers:
        data.connection_headers ?? existing.connection_headers,
    }).catch(() => null);
    const tools = fetchedTools?.length ? fetchedTools : null;

    // Update the connection with the refreshed tools and configuration
    const updatePayload: Partial<ConnectionEntity> = {
      ...data,
      tools,
      configuration_state: finalState,
      configuration_scopes: finalScopes,
    };
    const connection = await ctx.storage.connections.update(id, updatePayload);

    // Invoke ON_MCP_CONFIGURATION callback if configuration was updated
    // Ignore errors but await for the response before responding
    if (
      (data.configuration_state !== undefined ||
        data.configuration_scopes !== undefined) &&
      finalState &&
      finalScopes.length > 0
    ) {
      try {
        const proxy = await createMCPProxy(id, ctx);
        await proxy.client.callTool({
          name: "ON_MCP_CONFIGURATION",
          arguments: {
            state: finalState,
            scopes: finalScopes,
          },
        });
      } catch (error) {
        console.error("Failed to invoke ON_MCP_CONFIGURATION callback", error);
      }
    }

    return {
      item: connection,
    };
  },
});

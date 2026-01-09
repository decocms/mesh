/**
 * COLLECTION_CONNECTIONS_UPDATE Tool
 *
 * Update an existing MCP connection (organization-scoped) with collection binding compliance.
 * Also handles MCP configuration state and scopes validation.
 */

import {
  getReferencedConnectionIds,
  parseScope,
} from "@/auth/configuration-scopes";
import { WellKnownMCPId } from "@/core/well-known-mcp";
import { DownstreamTokenStorage } from "@/storage/downstream-token";
import { z } from "zod";
import { defineTool } from "../../core/define-tool";
import {
  getUserId,
  requireAuth,
  requireOrganization,
} from "../../core/mesh-context";
import { fetchToolsFromMCP } from "./fetch-tools";
import { prop } from "./json-path";
import {
  type ConnectionEntity,
  ConnectionEntitySchema,
  ConnectionUpdateDataSchema,
} from "./schema";

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
 * Validate configuration state and scopes, checking referenced connections
 */
async function validateConfiguration(
  state: Record<string, unknown>,
  scopes: string[],
  organizationId: string,
  ctx: Parameters<typeof COLLECTION_CONNECTIONS_UPDATE.execute>[1],
): Promise<void> {
  // Validate scope format and state keys
  for (const scope of scopes) {
    // Parse scope format: "KEY::SCOPE" (throws on invalid format)
    if (scope === "*") {
      continue;
    }
    const [key] = parseScope(scope);
    const value = prop(key, state);

    // Check if this key exists in state

    if (value === undefined || value === null) {
      throw new Error(
        `Scope references key "${key}" but it's not present in state`,
      );
    }
  }

  // Get all referenced connection IDs
  const referencedConnections = getReferencedConnectionIds(state, scopes);

  // Validate all referenced connections
  for (const refConnectionId of referencedConnections) {
    if (refConnectionId === WellKnownMCPId.SELF) {
      continue;
    }
    // Verify connection exists and belongs to same organization
    // Use consistent error message to prevent cross-org information disclosure
    const refConnection =
      await ctx.storage.connections.findById(refConnectionId);
    if (!refConnection || refConnection.organization_id !== organizationId) {
      throw new Error(`Referenced connection not found: ${refConnectionId}`);
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

    const userId = getUserId(ctx);
    if (!userId) {
      throw new Error("User ID required to update connection");
    }

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

    // Fetch tools from the MCP server.
    // If the connection uses OAuth (token stored in downstream_tokens), use the org-level
    // access token to discover tools after authentication.
    let tokenForToolFetch = data.connection_token ?? existing.connection_token;
    if (!tokenForToolFetch) {
      try {
        const tokenStorage = new DownstreamTokenStorage(ctx.db, ctx.vault);
        const cachedToken = await tokenStorage.get(id);
        if (cachedToken?.accessToken) {
          tokenForToolFetch = cachedToken.accessToken;
        }
      } catch {
        // Ignore token lookup errors and fall back to unauthenticated discovery.
      }
    }

    const fetchedTools = await fetchToolsFromMCP({
      id: existing.id,
      title: data.title ?? existing.title,
      connection_type: data.connection_type ?? existing.connection_type,
      connection_url: data.connection_url ?? existing.connection_url,
      connection_token: tokenForToolFetch,
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
        const proxy = await ctx.createMCPProxy(id);
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

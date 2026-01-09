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
import { refreshAccessToken } from "@/oauth/token-refresh";
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

function isUnauthorizedDownstreamMcpError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && (error as { code?: unknown }).code === 401)
    return true;
  if (
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string" &&
    (error as { message: string }).message
      .toLowerCase()
      .includes("unauthorized")
  ) {
    return true;
  }
  return false;
}

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
    // If the connection uses OAuth (token stored in downstream_tokens), use the per-user
    // access token to discover tools after authentication.
    const hasExplicitConnectionToken = Object.prototype.hasOwnProperty.call(
      data,
      "connection_token",
    );
    const explicitConnectionToken = hasExplicitConnectionToken
      ? (data.connection_token ?? null)
      : null;

    const tokenStorage = new DownstreamTokenStorage(ctx.db, ctx.vault);
    let downstreamAccessToken: string | null = null;
    let downstreamCanRefresh = false;
    let downstreamRefreshAttempted = false;
    let downstreamTokenWasDeleted = false;
    let cachedDownstreamToken = await tokenStorage
      .get(id, userId)
      .catch(() => null);

    if (cachedDownstreamToken) {
      downstreamCanRefresh =
        !!cachedDownstreamToken.refreshToken &&
        !!cachedDownstreamToken.tokenEndpoint &&
        !!cachedDownstreamToken.clientId;

      const isExpired = tokenStorage.isExpired(
        cachedDownstreamToken,
        downstreamCanRefresh ? 5 * 60 * 1000 : 0,
      );

      if (isExpired) {
        if (downstreamCanRefresh) {
          downstreamRefreshAttempted = true;
          const refreshResult = await refreshAccessToken(cachedDownstreamToken);

          if (refreshResult.success && refreshResult.accessToken) {
            await tokenStorage
              .upsert({
                connectionId: id,
                userId,
                accessToken: refreshResult.accessToken,
                refreshToken:
                  refreshResult.refreshToken ??
                  cachedDownstreamToken.refreshToken,
                scope: refreshResult.scope ?? cachedDownstreamToken.scope,
                expiresAt: refreshResult.expiresIn
                  ? new Date(Date.now() + refreshResult.expiresIn * 1000)
                  : null,
                clientId: cachedDownstreamToken.clientId,
                clientSecret: cachedDownstreamToken.clientSecret,
                tokenEndpoint: cachedDownstreamToken.tokenEndpoint,
              })
              .catch(() => null);
            downstreamAccessToken = refreshResult.accessToken;
          } else {
            await tokenStorage.delete(id, userId).catch(() => null);
            downstreamTokenWasDeleted = true;
            cachedDownstreamToken = null;
          }
        } else {
          // Expired and cannot refresh → remove so UI can prompt re-auth.
          await tokenStorage.delete(id, userId).catch(() => null);
          downstreamTokenWasDeleted = true;
          cachedDownstreamToken = null;
        }
      } else {
        downstreamAccessToken = cachedDownstreamToken.accessToken;
      }
    }

    const candidateTokens: Array<{
      token: string | null;
      source: "explicit" | "downstream" | "connection";
    }> = [];

    if (hasExplicitConnectionToken) {
      candidateTokens.push({
        token: explicitConnectionToken,
        source: "explicit",
      });
    } else {
      // Prefer downstream per-user token over connection_token (matches proxy behavior).
      if (downstreamAccessToken) {
        candidateTokens.push({
          token: downstreamAccessToken,
          source: "downstream",
        });
      }
      if (existing.connection_token) {
        candidateTokens.push({
          token: existing.connection_token,
          source: "connection",
        });
      }
    }

    // Always allow an unauthenticated attempt as a last resort (some servers expose tools publicly).
    candidateTokens.push({ token: null, source: "explicit" });

    const baseToolFetchInput = {
      id: existing.id,
      title: data.title ?? existing.title,
      connection_type: data.connection_type ?? existing.connection_type,
      connection_url: data.connection_url ?? existing.connection_url,
      connection_headers:
        data.connection_headers ?? existing.connection_headers,
    } as const;

    let tools: Awaited<ReturnType<typeof fetchToolsFromMCP>> = null;
    for (const candidate of candidateTokens) {
      try {
        const fetchedTools = await fetchToolsFromMCP({
          ...baseToolFetchInput,
          connection_token: candidate.token,
        });
        if (fetchedTools?.length) {
          tools = fetchedTools;
          break;
        }
        continue;
      } catch (error) {
        if (!isUnauthorizedDownstreamMcpError(error)) {
          console.error(
            `Failed to fetch tools from connection ${existing.id} (source=${candidate.source}):`,
            error,
          );
          break;
        }

        // Unauthorized: try refresh for downstream token (if we have it), otherwise try next candidate.
        if (
          candidate.source === "downstream" &&
          cachedDownstreamToken &&
          downstreamCanRefresh &&
          !downstreamRefreshAttempted
        ) {
          downstreamRefreshAttempted = true;
          const refreshResult = await refreshAccessToken(cachedDownstreamToken);
          if (refreshResult.success && refreshResult.accessToken) {
            await tokenStorage
              .upsert({
                connectionId: id,
                userId,
                accessToken: refreshResult.accessToken,
                refreshToken:
                  refreshResult.refreshToken ??
                  cachedDownstreamToken.refreshToken,
                scope: refreshResult.scope ?? cachedDownstreamToken.scope,
                expiresAt: refreshResult.expiresIn
                  ? new Date(Date.now() + refreshResult.expiresIn * 1000)
                  : null,
                clientId: cachedDownstreamToken.clientId,
                clientSecret: cachedDownstreamToken.clientSecret,
                tokenEndpoint: cachedDownstreamToken.tokenEndpoint,
              })
              .catch(() => null);

            // Retry once with the refreshed access token
            try {
              const fetchedTools = await fetchToolsFromMCP({
                ...baseToolFetchInput,
                connection_token: refreshResult.accessToken,
              });
              if (fetchedTools?.length) {
                tools = fetchedTools;
                break;
              }
            } catch (retryError) {
              if (!isUnauthorizedDownstreamMcpError(retryError)) {
                console.error(
                  `Failed to fetch tools after token refresh for ${existing.id}:`,
                  retryError,
                );
              }
            }
          }

          // Refresh failed or still unauthorized → delete token so UI can re-auth.
          await tokenStorage.delete(id, userId).catch(() => null);
          downstreamTokenWasDeleted = true;
          cachedDownstreamToken = null;
        } else if (
          candidate.source === "downstream" &&
          cachedDownstreamToken &&
          !downstreamTokenWasDeleted
        ) {
          // No refresh available but token is invalid → delete it.
          await tokenStorage.delete(id, userId).catch(() => null);
          downstreamTokenWasDeleted = true;
          cachedDownstreamToken = null;
        }

        continue;
      }
    }

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

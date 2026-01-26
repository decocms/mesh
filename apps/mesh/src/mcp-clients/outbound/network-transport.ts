/**
 * Network MCP Transports
 *
 * Transport creation for HTTP, SSE, and Websocket connections
 */

import { extractConnectionPermissions } from "@/auth/configuration-scopes";
import { issueMeshToken } from "@/auth/jwt";
import { once } from "@/common";
import { AccessControl } from "@/core/access-control";
import { refreshAccessToken } from "@/oauth/token-refresh";
import { DownstreamTokenStorage } from "@/storage/downstream-token";
import { composeTransports } from "@decocms/mesh-sdk";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { MeshContext } from "../../core/mesh-context";
import type {
  ConnectionEntity,
  HttpConnectionParameters,
} from "../../tools/connection/schema";

/**
 * Create a logging transport middleware that tracks metrics
 */
export function createLoggingTransport(
  connectionId: string,
  connectionType: ConnectionEntity["connection_type"],
  meter: MeshContext["meter"],
): Transport {
  return {
    async start() {},
    async close() {},
    async send(message) {
      const method =
        message && typeof message === "object" && "method" in message
          ? String(message.method)
          : "unknown";
      meter.createCounter("connection.transport.send").add(1, {
        "connection.id": connectionId,
        "connection.type": connectionType,
        "rpc.method": method,
      });
    },
    onmessage(message) {
      const method =
        message && typeof message === "object" && "method" in message
          ? String(message.method)
          : "unknown";
      meter.createCounter("connection.transport.receive").add(1, {
        "connection.id": connectionId,
        "connection.type": connectionType,
        "rpc.method": method,
      });
    },
    onerror(error) {
      meter.createCounter("connection.transport.errors").add(1, {
        "connection.id": connectionId,
        "connection.type": connectionType,
        error: error.message,
      });
    },
  };
}

/**
 * Options for building request headers
 */
export interface BuildRequestHeadersOptions {
  connection: ConnectionEntity;
  ctx: MeshContext;
}

/**
 * Build request headers for HTTP/SSE/Websocket connections
 * Handles OAuth token refresh and configuration token issuance
 */
export function buildRequestHeaders(
  options: BuildRequestHeadersOptions,
): () => Promise<Record<string, string>> {
  const { connection, ctx } = options;
  const connectionId = connection.id;

  // Lazy token issuance - only issue when buildRequestHeaders is called
  let configurationToken: string | undefined;

  const callerConnectionId = ctx.auth.user?.connectionId;

  /**
   * Issue configuration JWT lazily (only when needed)
   * This avoids issuing tokens when creating proxies that may never be used.
   * Uses `once` to prevent race conditions - concurrent calls share the same promise.
   */
  const ensureConfigurationToken = once(async (): Promise<void> => {
    // Extract connection permissions from configuration state and scopes
    // Format: "KEY::SCOPE" where KEY is in state and state[KEY].value is a connection ID
    // Result: { [connectionId]: [scopes...] }
    const permissions = extractConnectionPermissions(
      connection.configuration_state as Record<string, unknown> | null,
      connection.configuration_scopes,
    );

    // Issue short-lived JWT with configuration permissions
    // JWT can be decoded directly by downstream to access payload
    const userId = ctx.auth.user?.id ?? ctx.auth.apiKey?.userId;
    if (!userId) {
      console.error("User ID required to issue configuration token");
      return;
    }

    try {
      configurationToken = await issueMeshToken({
        sub: userId,
        user: { id: userId },
        metadata: {
          state: connection.configuration_state ?? undefined,
          meshUrl: process.env.MESH_URL ?? ctx.baseUrl,
          connectionId,
          organizationId: ctx.organization?.id,
        },
        permissions,
      });
    } catch (error) {
      console.error("Failed to issue configuration token:", error);
      // Continue without configuration token - downstream will fail if it requires it
    }
  });

  return async (): Promise<Record<string, string>> => {
    // Ensure configuration token is issued (lazy)
    await ensureConfigurationToken();

    const headers: Record<string, string> = {
      ...(callerConnectionId ? { "x-caller-id": callerConnectionId } : {}),
      ...(ctx.metadata.wellKnownForwardableHeaders ?? {}),
      "x-request-id": ctx.metadata.requestId,
    };

    // Try to get cached token from downstream_tokens first
    // This supports OAuth token refresh for connections that use OAuth
    let accessToken: string | null = null;

    const tokenStorage = new DownstreamTokenStorage(ctx.db, ctx.vault);
    const cachedToken = await tokenStorage.get(connectionId);

    if (cachedToken) {
      const canRefresh =
        !!cachedToken.refreshToken && !!cachedToken.tokenEndpoint;
      // If we can refresh, treat "expiring soon" as expired to proactively refresh.
      // If we cannot refresh, only treat as expired at actual expiry (no buffer),
      // otherwise short-lived tokens would be deleted immediately.
      const isExpired = tokenStorage.isExpired(
        cachedToken,
        canRefresh ? 5 * 60 * 1000 : 0,
      );

      if (isExpired) {
        // Try to refresh if we have refresh capability
        if (canRefresh) {
          console.log(
            `[Proxy] Token expired for ${connectionId}, attempting refresh`,
          );
          const refreshResult = await refreshAccessToken(cachedToken);

          if (refreshResult.success && refreshResult.accessToken) {
            // Save refreshed token
            await tokenStorage.upsert({
              connectionId,
              accessToken: refreshResult.accessToken,
              refreshToken:
                refreshResult.refreshToken ?? cachedToken.refreshToken,
              scope: refreshResult.scope ?? cachedToken.scope,
              expiresAt: refreshResult.expiresIn
                ? new Date(Date.now() + refreshResult.expiresIn * 1000)
                : null,
              clientId: cachedToken.clientId,
              clientSecret: cachedToken.clientSecret,
              tokenEndpoint: cachedToken.tokenEndpoint,
            });

            accessToken = refreshResult.accessToken;
            console.log(`[Proxy] Token refreshed for ${connectionId}`);
          } else {
            // Refresh failed - token is invalid
            // Delete the cached token so user gets prompted to re-auth
            await tokenStorage.delete(connectionId);
            console.error(
              `[Proxy] Token refresh failed for ${connectionId}: ${refreshResult.error}`,
            );
          }
        } else {
          // Token expired but no refresh capability - delete it
          await tokenStorage.delete(connectionId);
          console.log(
            `[Proxy] Token expired without refresh capability for ${connectionId}`,
          );
        }
      } else {
        // Token is still valid
        accessToken = cachedToken.accessToken;
      }
    }

    // Fall back to connection token if no cached token
    if (!accessToken && connection.connection_token) {
      accessToken = connection.connection_token;
    }

    // Add authorization header if we have a token
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    // Add configuration token if issued
    if (configurationToken) {
      headers["x-mesh-token"] = configurationToken;
    }

    return headers;
  };
}

/**
 * Options for creating auth transport
 */
export interface CreateAuthTransportOptions {
  connection: ConnectionEntity;
  ctx: MeshContext;
  bypassAuth: boolean;
}

/**
 * Create authorization transport middleware
 * Checks tool permissions before sending tool call messages
 */
export function createAuthTransport(
  options: CreateAuthTransportOptions,
): Transport {
  const { connection, ctx, bypassAuth } = options;
  const connectionId = connection.id;

  const isToolCallMessage = (message: JSONRPCMessage) =>
    !!message &&
    typeof message === "object" &&
    "method" in message &&
    message.method === "tools/call";

  return {
    async start() {},
    async close() {},
    async send(message) {
      if (bypassAuth || !isToolCallMessage(message)) return;
      const toolName = (message as { params?: { name?: string } }).params?.name;
      if (!toolName) return;

      const getToolMeta = async () => {
        const tool = connection.tools?.find((t) => t.name === toolName);
        return tool?._meta as Record<string, unknown> | undefined;
      };

      const connectionAccessControl = new AccessControl(
        ctx.authInstance,
        ctx.auth.user?.id ?? ctx.auth.apiKey?.userId,
        toolName,
        ctx.boundAuth,
        ctx.auth.user?.role,
        connectionId,
        getToolMeta,
      );

      await connectionAccessControl.check(toolName);
    },
  };
}

/**
 * Options for creating a transport for a connection
 */
export interface CreateTransportOptions {
  connection: ConnectionEntity;
  httpParams: HttpConnectionParameters | null;
  ctx: MeshContext;
  bypassAuth: boolean;
}

/**
 * Create transport for HTTP, SSE, or Websocket connections
 */
export async function createTransportForConnection(
  options: CreateTransportOptions,
): Promise<Transport> {
  const { connection, httpParams, ctx, bypassAuth } = options;
  const connectionId = connection.id;

  // Create logging transport
  const loggingTransport = createLoggingTransport(
    connectionId,
    connection.connection_type,
    ctx.meter,
  );

  const middlewares: Transport[] = [
    loggingTransport,
    createAuthTransport({ connection, ctx, bypassAuth }),
  ];

  // Create buildRequestHeaders function
  const buildHeaders = buildRequestHeaders({ connection, ctx });

  switch (connection.connection_type) {
    case "HTTP":
    case "Websocket": {
      if (!connection.connection_url) {
        throw new Error(`${connection.connection_type} connection missing URL`);
      }

      const headers = await buildHeaders();
      if (httpParams?.headers) {
        Object.assign(headers, httpParams.headers);
      }

      const transport = new StreamableHTTPClientTransport(
        new URL(connection.connection_url),
        { requestInit: { headers } },
      );

      return composeTransports([...middlewares, transport]);
    }

    case "SSE": {
      if (!connection.connection_url) {
        throw new Error("SSE connection missing URL");
      }

      const headers = await buildHeaders();
      if (httpParams?.headers) {
        Object.assign(headers, httpParams.headers);
      }

      const transport = new SSEClientTransport(
        new URL(connection.connection_url),
        { requestInit: { headers } },
      );

      return composeTransports([...middlewares, transport]);
    }

    default:
      throw new Error(
        `Unsupported transport type: ${connection.connection_type}`,
      );
  }
}

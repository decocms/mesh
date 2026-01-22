/**
 * MCP Proxy Routes
 *
 * Proxies MCP requests to downstream connections using the official MCP SDK.
 * Based on the pattern from @modelcontextprotocol/typescript-sdk
 *
 * Architecture:
 * - Creates MCP Server to handle incoming requests
 * - Creates MCP Client to connect to downstream connections
 * - Uses middleware pipeline for authorization
 * - Supports StreamableHTTP and STDIO transports
 */

import { createMCPAggregatorFromEntity } from "@/aggregator";
import { extractConnectionPermissions } from "@/auth/configuration-scopes";
import { once } from "@/common";
import { getMonitoringConfig } from "@/core/config";
import { refreshAccessToken } from "@/oauth/token-refresh";
import { getStableStdioClient } from "@/stdio/stable-transport";
import { DownstreamTokenStorage } from "@/storage/downstream-token";
import {
  ConnectionEntity,
  type HttpConnectionParameters,
  isStdioParameters,
  parseVirtualUrl,
} from "@/tools/connection/schema";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  type CallToolRequest,
  CallToolRequestSchema,
  type CallToolResult,
  type GetPromptRequest,
  GetPromptRequestSchema,
  type GetPromptResult,
  ListPromptsRequestSchema,
  type ListPromptsResult,
  ListResourcesRequestSchema,
  type ListResourcesResult,
  ListResourceTemplatesRequestSchema,
  type ListResourceTemplatesResult,
  ListToolsRequestSchema,
  type ListToolsResult,
  type ReadResourceRequest,
  ReadResourceRequestSchema,
  type ReadResourceResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { Context, Hono } from "hono";
import { issueMeshToken } from "../../auth/jwt";
import { AccessControl } from "../../core/access-control";
import type { MeshContext } from "../../core/mesh-context";
import { compose } from "../utils/compose";
import { handleAuthError } from "./oauth-proxy";
import {
  createProxyMonitoringMiddleware,
  createProxyStreamableMonitoringMiddleware,
  ProxyMonitoringMiddlewareParams,
} from "./proxy-monitoring";

// Define Hono variables type
type Variables = {
  meshContext: MeshContext;
};

const app = new Hono<{ Variables: Variables }>();

// ============================================================================
// MCP Tool Call Configuration
// ============================================================================

/**
 * Default timeout for MCP tool calls in milliseconds.
 * The MCP SDK default is 60 seconds (60000ms).
 * Increase this value for tools that take longer to execute.
 */
export const MCP_TOOL_CALL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// Middleware Types
// ============================================================================

type CallToolMiddleware = (
  request: CallToolRequest,
  next: () => Promise<CallToolResult>,
) => Promise<CallToolResult>;

type CallStreamableToolMiddleware = (
  request: CallToolRequest,
  next: () => Promise<Response>,
) => Promise<Response>;

// ============================================================================
// Authorization Middleware
// ============================================================================

/**
 * Authorization middleware - checks access to tool on connection
 * Inspired by withMCPAuthorization from @deco/sdk
 *
 * Permission check: { '<connectionId>': ['toolName'] }
 * Delegates to Better Auth's hasPermission API via boundAuth
 *
 * Supports public tools: if tool._meta["mcp.mesh"].public_tool is true,
 * unauthenticated requests are allowed through.
 */
function withConnectionAuthorization(
  ctx: MeshContext,
  connectionId: string,
  listToolsFn: () => Promise<ListToolsResult>,
): CallToolMiddleware {
  return async (request, next) => {
    try {
      const toolName = request.params.name;

      // Create getToolMeta callback scoped to current tool
      const getToolMeta = async () => {
        const { tools } = await listToolsFn();
        const tool = tools.find((t) => t.name === toolName);
        return tool?._meta as Record<string, unknown> | undefined;
      };

      // Create AccessControl with connectionId set
      // This checks: does user have permission for this TOOL on this CONNECTION?
      // Better Auth resolves the user's role permissions internally
      const connectionAccessControl = new AccessControl(
        ctx.authInstance,
        ctx.auth.user?.id ?? ctx.auth.apiKey?.userId,
        toolName, // Tool being called
        ctx.boundAuth, // Bound auth client (encapsulates headers)
        ctx.auth.user?.role, // Role for built-in role bypass
        connectionId, // Connection ID for permission check
        getToolMeta, // Callback for public tool check
      );

      await connectionAccessControl.check(toolName);

      return await next();
    } catch (error) {
      const err = error as Error;
      return {
        content: [
          {
            type: "text",
            text: `Authorization failed: ${err.message}`,
          },
        ],
        isError: true,
      };
    }
  };
}

/**
 * Streamable authorization middleware - checks access to tool on connection
 * Returns Response instead of CallToolResult for streaming use cases
 *
 * Supports public tools: if tool._meta["mcp.mesh"].public_tool is true,
 * unauthenticated requests are allowed through.
 */
function withStreamableConnectionAuthorization(
  ctx: MeshContext,
  connectionId: string,
  listToolsFn: () => Promise<ListToolsResult>,
): CallStreamableToolMiddleware {
  return async (request, next) => {
    try {
      const toolName = request.params.name;

      // Create getToolMeta callback scoped to current tool
      const getToolMeta = async () => {
        const { tools } = await listToolsFn();
        const tool = tools.find((t) => t.name === toolName);
        return tool?._meta as Record<string, unknown> | undefined;
      };

      const connectionAccessControl = new AccessControl(
        ctx.authInstance,
        ctx.auth.user?.id ?? ctx.auth.apiKey?.userId,
        toolName,
        ctx.boundAuth, // Bound auth client (encapsulates headers)
        ctx.auth.user?.role,
        connectionId,
        getToolMeta, // Callback for public tool check
      );

      await connectionAccessControl.check(toolName);

      return await next();
    } catch (error) {
      const err = error as Error;
      return new Response(
        JSON.stringify({
          error: `Authorization failed: ${err.message}`,
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  };
}

// ============================================================================
// MCP Proxy Factory
// ============================================================================

/**
 * Create MCP proxy for a downstream connection
 * Pattern from @deco/api proxy() function
 *
 * Single server approach - tools from downstream are dynamically fetched and registered
 */
async function createMCPProxyDoNotUseDirectly(
  connectionIdOrConnection: string | ConnectionEntity,
  ctx: MeshContext,
  { superUser }: { superUser: boolean }, // this is basically used for background workers that needs cross-organization access
) {
  // Get connection details
  const connection =
    typeof connectionIdOrConnection === "string"
      ? await ctx.storage.connections.findById(
          connectionIdOrConnection,
          ctx.organization?.id,
        )
      : connectionIdOrConnection;
  if (!connection) {
    throw new Error("Connection not found");
  }
  const connectionId = connection?.id;

  if (ctx.organization && connection.organization_id !== ctx.organization.id) {
    throw new Error("Connection does not belong to the active organization");
  }
  ctx.organization ??= { id: connection.organization_id };

  if (connection.status !== "active") {
    throw new Error(`Connection inactive: ${connection.status}`);
  }

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

  // Build request headers - reusable for both client and direct fetch
  // Now issues token lazily on first call
  // Also handles token refresh for downstream OAuth tokens
  const buildRequestHeaders = async (): Promise<Record<string, string>> => {
    // Ensure configuration token is issued (lazy)
    await ensureConfigurationToken();

    const headers: Record<string, string> = {
      ...(callerConnectionId ? { "x-caller-id": callerConnectionId } : {}),
      ...(ctx.metadata.wellKnownForwardableHeaders ?? {}),
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

  // Determine connection type and extract parameters
  const isStdio = connection.connection_type === "STDIO";
  const stdioParams = isStdioParameters(connection.connection_headers)
    ? connection.connection_headers
    : null;
  const httpParams = !isStdio
    ? (connection.connection_headers as HttpConnectionParameters | null)
    : null;

  // Create client factory for downstream MCP based on connection_type
  const createClient = async () => {
    switch (connection.connection_type) {
      case "STDIO": {
        // Block STDIO connections in production unless explicitly allowed
        if (
          process.env.NODE_ENV === "production" &&
          process.env.UNSAFE_ALLOW_STDIO_TRANSPORT !== "true"
        ) {
          throw new Error(
            "STDIO connections are disabled in production. Set UNSAFE_ALLOW_STDIO_TRANSPORT=true to enable.",
          );
        }

        if (!stdioParams) {
          throw new Error("STDIO connection missing parameters");
        }

        // Get or create stable connection - respawns automatically if closed
        // We want stable local MCP connection - don't spawn new process per request
        return getStableStdioClient({
          id: connectionId,
          name: connection.title,
          command: stdioParams.command,
          args: stdioParams.args,
          env: stdioParams.envVars,
          cwd: stdioParams.cwd,
        });
      }

      case "HTTP":
      case "Websocket": {
        if (!connection.connection_url) {
          throw new Error(
            `${connection.connection_type} connection missing URL`,
          );
        }

        const client = new Client({ name: "mcp-mesh-proxy", version: "1.0.0" });
        const headers = await buildRequestHeaders();
        if (httpParams?.headers) {
          Object.assign(headers, httpParams.headers);
        }

        const transport = new StreamableHTTPClientTransport(
          new URL(connection.connection_url),
          { requestInit: { headers } },
        );

        await client.connect(transport);
        return client;
      }

      case "SSE": {
        if (!connection.connection_url) {
          throw new Error("SSE connection missing URL");
        }

        const client = new Client({ name: "mcp-mesh-proxy", version: "1.0.0" });
        const headers = await buildRequestHeaders();
        if (httpParams?.headers) {
          Object.assign(headers, httpParams.headers);
        }

        const transport = new SSEClientTransport(
          new URL(connection.connection_url),
          { requestInit: { headers } },
        );

        await client.connect(transport);
        return client;
      }

      case "VIRTUAL": {
        // Parse virtual MCP ID from URL: virtual://$id
        const virtualMcpId = parseVirtualUrl(connection.connection_url);
        if (!virtualMcpId) {
          throw new Error(
            "VIRTUAL connection missing virtual MCP ID in connection_url",
          );
        }

        // Load virtual MCP entity
        const virtualMcp = await ctx.storage.virtualMcps.findById(virtualMcpId);
        if (!virtualMcp) {
          throw new Error(`Virtual MCP not found: ${virtualMcpId}`);
        }

        // Create aggregator client from virtual MCP entity
        const aggregator = await createMCPAggregatorFromEntity(
          virtualMcp,
          ctx,
          "passthrough",
        );

        // Return a client-like interface wrapping the aggregator
        // This makes VIRTUAL connections work seamlessly with the rest of the proxy
        return {
          callTool: (params: {
            name: string;
            arguments?: Record<string, unknown>;
          }) => aggregator.client.callTool(params),
          listTools: () => aggregator.client.listTools(),
          listResources: () => aggregator.client.listResources(),
          readResource: (params: { uri: string }) =>
            aggregator.client.readResource(params),
          listResourceTemplates: () =>
            aggregator.client.listResourceTemplates(),
          listPrompts: () => aggregator.client.listPrompts(),
          getPrompt: (params: {
            name: string;
            arguments?: Record<string, string>;
          }) => aggregator.client.getPrompt(params),
          close: async () => {
            // Aggregator doesn't need explicit cleanup
          },
          getServerCapabilities: () => ({
            tools: {},
            resources: {},
            prompts: {},
          }),
        } as unknown as Client;
      }

      default:
        throw new Error(
          `Unknown connection type: ${connection.connection_type}`,
        );
    }
  };

  // List tools from downstream connection
  // Uses indexed tools if available, falls back to client for connections without cached tools
  // NOTE: Defined early so it can be passed to authorization middlewares for public tool check
  const listTools = async (): Promise<ListToolsResult> => {
    // Use indexed tools if available
    if (connection.tools && connection.tools.length > 0) {
      return {
        tools: connection.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema as Tool["inputSchema"],
          outputSchema: tool.outputSchema as Tool["outputSchema"],
          annotations: tool.annotations,
          _meta: tool._meta,
        })),
      };
    }

    // Fall back to client for connections without indexed tools
    let client: Awaited<ReturnType<typeof createClient>> | undefined;
    try {
      client = await createClient();
      return await client.listTools();
    } finally {
      client?.close().catch(console.error);
    }
  };

  // Create authorization middlewares
  // Uses boundAuth for permission checks (delegates to Better Auth)
  // Pass listTools for public tool check
  const authMiddleware: CallToolMiddleware = superUser
    ? async (_, next) => await next()
    : withConnectionAuthorization(ctx, connectionId, listTools);
  const streamableAuthMiddleware: CallStreamableToolMiddleware = superUser
    ? async (_, next) => await next()
    : withStreamableConnectionAuthorization(ctx, connectionId, listTools);

  // If ctx.connectionId is set and different from current connection,
  // it means this proxy is being called through a Virtual MCP (agent)
  const virtualMcpId =
    ctx.connectionId && ctx.connectionId !== connectionId
      ? ctx.connectionId
      : undefined;

  const monitoringConfig: ProxyMonitoringMiddlewareParams = {
    enabled: getMonitoringConfig().enabled,
    connectionId,
    connectionTitle: connection.title,
    virtualMcpId,
    ctx,
  };

  const proxyMonitoringMiddleware =
    createProxyMonitoringMiddleware(monitoringConfig);
  const proxyStreamableMonitoringMiddleware =
    createProxyStreamableMonitoringMiddleware(monitoringConfig);

  // Compose middlewares
  const callToolPipeline = compose(proxyMonitoringMiddleware, authMiddleware);
  const callStreamableToolPipeline = compose(
    proxyStreamableMonitoringMiddleware,
    streamableAuthMiddleware,
  );

  // Core tool execution logic - shared between fetch and callTool
  const executeToolCall = async (
    request: CallToolRequest,
  ): Promise<CallToolResult> => {
    return callToolPipeline(request, async (): Promise<CallToolResult> => {
      const client = await createClient();
      const startTime = Date.now();

      // Strip _meta from arguments before forwarding to upstream server
      // (_meta is used for internal monitoring properties and should not be sent upstream)
      const forwardParams = { ...request.params };
      if (forwardParams.arguments && "_meta" in forwardParams.arguments) {
        const { _meta, ...restArgs } = forwardParams.arguments;
        forwardParams.arguments = restArgs;
      }

      // Start span for tracing
      return await ctx.tracer.startActiveSpan(
        "mcp.proxy.callTool",
        {
          attributes: {
            "connection.id": connectionId,
            "tool.name": request.params.name,
          },
        },
        async (span) => {
          try {
            const result = await client.callTool(forwardParams, undefined, {
              timeout: MCP_TOOL_CALL_TIMEOUT_MS,
            });
            const duration = Date.now() - startTime;

            // Record duration histogram
            ctx.meter
              .createHistogram("connection.proxy.duration")
              .record(duration, {
                "connection.id": connectionId,
                "tool.name": request.params.name,
                status: "success",
              });

            // Record success counter
            ctx.meter.createCounter("connection.proxy.requests").add(1, {
              "connection.id": connectionId,
              "tool.name": request.params.name,
              status: "success",
            });

            span.end();
            return result as CallToolResult;
          } catch (error) {
            const err = error as Error;
            const duration = Date.now() - startTime;

            // Record duration histogram even on error
            ctx.meter
              .createHistogram("connection.proxy.duration")
              .record(duration, {
                "connection.id": connectionId,
                "tool.name": request.params.name,
                status: "error",
              });

            // Record error counter
            ctx.meter.createCounter("connection.proxy.errors").add(1, {
              "connection.id": connectionId,
              "tool.name": request.params.name,
              error: err.message,
            });

            span.recordException(err);
            span.end();

            throw error;
          } finally {
            // Close client - stdio connections ignore close() via stable-transport
            client.close().catch(console.error);
          }
        },
      );
    });
  };

  // List resources from downstream connection
  const listResources = async (): Promise<ListResourcesResult> => {
    let client: Awaited<ReturnType<typeof createClient>> | undefined;
    try {
      client = await createClient();
      const capabilities = client.getServerCapabilities();
      if (!capabilities?.resources) {
        return { resources: [] };
      }
      return await client.listResources();
    } finally {
      client?.close().catch(console.error);
    }
  };

  // Read a specific resource from downstream connection
  const readResource = async (
    params: ReadResourceRequest["params"],
  ): Promise<ReadResourceResult> => {
    let client: Awaited<ReturnType<typeof createClient>> | undefined;
    try {
      client = await createClient();
      return await client.readResource(params);
    } finally {
      client?.close().catch(console.error);
    }
  };

  // List resource templates from downstream connection
  const listResourceTemplates =
    async (): Promise<ListResourceTemplatesResult> => {
      let client: Awaited<ReturnType<typeof createClient>> | undefined;
      try {
        client = await createClient();
        const capabilities = client.getServerCapabilities();
        if (!capabilities?.resources) {
          return { resourceTemplates: [] };
        }
        return await client.listResourceTemplates();
      } finally {
        client?.close().catch(console.error);
      }
    };

  // List prompts from downstream connection
  const listPrompts = async (): Promise<ListPromptsResult> => {
    let client: Awaited<ReturnType<typeof createClient>> | undefined;
    try {
      client = await createClient();
      const capabilities = client.getServerCapabilities();
      if (!capabilities?.prompts) {
        return { prompts: [] };
      }
      return await client.listPrompts();
    } finally {
      client?.close().catch(console.error);
    }
  };

  // Get a specific prompt from downstream connection
  const getPrompt = async (
    params: GetPromptRequest["params"],
  ): Promise<GetPromptResult> => {
    let client: Awaited<ReturnType<typeof createClient>> | undefined;
    try {
      client = await createClient();
      const capabilities = client.getServerCapabilities();
      if (!capabilities?.prompts) {
        throw new Error("Prompts capability not supported");
      }
      return await client.getPrompt(params);
    } finally {
      client?.close().catch(console.error);
    }
  };

  // Call tool using fetch directly for streaming support
  // Inspired by @deco/api proxy callStreamableTool
  // Note: Only works for HTTP connections - STDIO and VIRTUAL don't support streaming fetch
  const callStreamableTool = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<Response> => {
    // VIRTUAL connections don't support streamable tools - fall back to regular call
    if (connection.connection_type === "VIRTUAL") {
      const result = await executeToolCall({
        method: "tools/call",
        params: { name, arguments: args },
      });
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!connection.connection_url) {
      throw new Error("Streamable tools require HTTP connection with URL");
    }
    const connectionUrl = connection.connection_url;

    const request: CallToolRequest = {
      method: "tools/call",
      params: { name, arguments: args },
    };
    return callStreamableToolPipeline(request, async (): Promise<Response> => {
      const headers = await buildRequestHeaders();

      // Add custom headers from connection_headers
      if (httpParams?.headers) {
        Object.assign(headers, httpParams.headers);
      }

      // Use fetch directly to support streaming responses
      // Build URL with tool name appended for call-tool endpoint pattern
      const url = new URL(connectionUrl);
      url.pathname =
        url.pathname.replace(/\/$/, "") + `/call-tool/${request.params.name}`;

      return await ctx.tracer.startActiveSpan(
        "mcp.proxy.callStreamableTool",
        {
          attributes: {
            "connection.id": connectionId,
            "tool.name": request.params.name,
          },
        },
        async (span) => {
          const startTime = Date.now();

          try {
            const response = await fetch(url.toString(), {
              method: "POST",
              redirect: "manual",
              body: JSON.stringify(request.params.arguments),
              headers: {
                ...headers,
                "Content-Type": "application/json",
              },
            });
            const duration = Date.now() - startTime;

            // Record metrics
            ctx.meter
              .createHistogram("connection.proxy.streamable.duration")
              .record(duration, {
                "connection.id": connectionId,
                "tool.name": request.params.name,
                status: response.ok ? "success" : "error",
              });

            ctx.meter
              .createCounter("connection.proxy.streamable.requests")
              .add(1, {
                "connection.id": connectionId,
                "tool.name": request.params.name,
                status: response.ok ? "success" : "error",
              });

            span.end();
            return response;
          } catch (error) {
            const err = error as Error;
            const duration = Date.now() - startTime;

            ctx.meter
              .createHistogram("connection.proxy.streamable.duration")
              .record(duration, {
                "connection.id": connectionId,
                "tool.name": request.params.name,
                status: "error",
              });

            ctx.meter
              .createCounter("connection.proxy.streamable.errors")
              .add(1, {
                "connection.id": connectionId,
                "tool.name": request.params.name,
                error: err.message,
              });

            span.recordException(err);
            span.end();
            throw error;
          }
        },
      );
    });
  };

  // Create fetch function that handles MCP protocol
  const handleMcpRequest = async (req: Request) => {
    // Create client once - throws HTTPException for auth errors
    const reqUrl = new URL(req.url);
    let client: Awaited<ReturnType<typeof createClient>>;
    try {
      client = await createClient();
    } catch (error) {
      // Check if this is an auth error - if so, return appropriate 401
      // Note: This only applies to HTTP connections
      const authResponse = connection.connection_url
        ? await handleAuthError({
            error: error as Error & { status?: number },
            reqUrl,
            connectionId,
            connectionUrl: connection.connection_url,
            headers: await buildRequestHeaders(),
          })
        : null;
      if (authResponse) {
        return authResponse;
      }
      throw error;
    }

    const clientCapabilities = client.getServerCapabilities();
    const proxyCapabilities = clientCapabilities ?? {
      tools: {},
      resources: {},
      prompts: {},
    };
    // Create MCP server for this proxy
    const server = new McpServer(
      {
        name: "mcp-mesh",
        version: "1.0.0",
      },
      {
        capabilities: proxyCapabilities,
      },
    );

    // Create transport (web-standard Streamable HTTP for fetch Request/Response)
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse:
        req.headers.get("Accept")?.includes("application/json") ?? false,
    });

    // Connect server to transport
    await server.connect(transport);

    // Tools handlers
    server.server.setRequestHandler(ListToolsRequestSchema, () =>
      client.listTools(),
    );

    // Set up call tool handler with middleware - reuses executeToolCall
    server.server.setRequestHandler(CallToolRequestSchema, executeToolCall);

    // Resources handlers
    if (proxyCapabilities.resources) {
      server.server.setRequestHandler(ListResourcesRequestSchema, () =>
        client.listResources(),
      );

      server.server.setRequestHandler(ReadResourceRequestSchema, (request) =>
        client.readResource(request.params),
      );

      server.server.setRequestHandler(ListResourceTemplatesRequestSchema, () =>
        client.listResourceTemplates(),
      );
    }

    if (proxyCapabilities.prompts) {
      // Prompts handlers
      server.server.setRequestHandler(ListPromptsRequestSchema, () =>
        client.listPrompts(),
      );

      server.server.setRequestHandler(GetPromptRequestSchema, (request) =>
        client.getPrompt(request.params),
      );
    }

    // Handle the incoming message
    // CRITICAL: Use try/finally to ensure BOTH transport AND client are closed after request
    // Without this, ReadableStream/WritableStream controllers and TextDecoderStream accumulate in memory
    try {
      return await transport.handleRequest(req);
    } finally {
      // Close the downstream client to release HTTP transport streams (TextDecoderStream, etc.)
      // This is critical - the client created at the start of handleMcpRequest was never being closed!
      try {
        await client.close();
      } catch {
        // Ignore close errors - client may already be closed
      }
      // Close the server transport
      try {
        await transport.close?.();
      } catch {
        // Ignore close errors - transport may already be closed
      }
    }
  };

  return {
    fetch: handleMcpRequest,
    client: {
      callTool: (args: CallToolRequest["params"]) => {
        return executeToolCall({
          method: "tools/call",
          params: args,
        });
      },
      listTools,
      listResources,
      readResource,
      listResourceTemplates,
      listPrompts,
      getPrompt,
    },
    callStreamableTool,
  };
}

/**
 * Create MCP proxy for a downstream connection
 * Pattern from @deco/api proxy() function
 *
 * Single server approach - tools from downstream are dynamically fetched and registered
 */
export async function createMCPProxy(
  connectionIdOrConnection: string | ConnectionEntity,
  ctx: MeshContext,
) {
  return createMCPProxyDoNotUseDirectly(connectionIdOrConnection, ctx, {
    superUser: false,
  });
}

/**
 * Create a MCP proxy for a downstream connection with super user access
 * @param connectionIdOrConnection - The connection ID or connection entity
 * @param ctx - The mesh context
 * @returns The MCP proxy
 */
export async function dangerouslyCreateSuperUserMCPProxy(
  connectionIdOrConnection: string | ConnectionEntity,
  ctx: MeshContext,
) {
  return createMCPProxyDoNotUseDirectly(connectionIdOrConnection, ctx, {
    superUser: true,
  });
}

// ============================================================================
// Route Handler
// ============================================================================

/**
 * Proxy MCP request to a downstream connection
 *
 * Route: POST /mcp/:connectionId
 * Connection IDs are globally unique UUIDs (no project prefix needed)
 */
app.all("/:connectionId", async (c) => {
  const connectionId = c.req.param("connectionId");
  const ctx = c.get("meshContext");

  try {
    const proxy = await ctx.createMCPProxy(connectionId);
    return await proxy.fetch(c.req.raw);
  } catch (error) {
    return handleError(error as Error, c);
  }
});

const handleError = (err: Error, c: Context) => {
  if (err.message.includes("not found")) {
    return c.json({ error: err.message }, 404);
  }
  if (err.message.includes("does not belong to the active organization")) {
    return c.json({ error: "Connection not found" }, 404);
  }
  if (err.message.includes("inactive")) {
    return c.json({ error: err.message }, 503);
  }
  return c.json({ error: "Internal server error", message: err.message }, 500);
};

app.all("/:connectionId/call-tool/:toolName", async (c) => {
  const connectionId = c.req.param("connectionId");
  const toolName = c.req.param("toolName");
  const ctx = c.get("meshContext");

  try {
    const proxy = await ctx.createMCPProxy(connectionId);
    const result = await proxy.client.callTool({
      name: toolName,
      arguments: await c.req.json(),
    });
    if (result instanceof Response) {
      return result;
    }

    if (result.isError) {
      return new Response(JSON.stringify(result.content), {
        headers: {
          "Content-Type": "application/json",
        },
        status: 500,
      });
    }

    return new Response(
      JSON.stringify(result.structuredContent ?? result.content),
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    return handleError(error as Error, c);
  }
});

export default app;

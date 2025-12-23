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
 * - Supports StreamableHTTP transport
 */

import { extractConnectionPermissions } from "@/auth/configuration-scopes";
import { once } from "@/common";
import { getMonitoringConfig } from "@/core/config";
import { ConnectionEntity } from "@/tools/connection/schema";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type CallToolRequest,
  type CallToolResult,
  type GetPromptRequest,
  type GetPromptResult,
  type ListPromptsResult,
  type ListResourcesResult,
  type ListResourceTemplatesResult,
  type ListToolsRequest,
  type ListToolsResult,
  type ReadResourceRequest,
  type ReadResourceResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { Hono } from "hono";
import { issueMeshToken } from "../../auth/jwt";
import { AccessControl } from "../../core/access-control";
import type { MeshContext } from "../../core/mesh-context";
import { HttpServerTransport } from "../http-server-transport";
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
 */
function withConnectionAuthorization(
  ctx: MeshContext,
  connectionId: string,
): CallToolMiddleware {
  return async (request, next) => {
    try {
      const toolName = request.params.name;

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
 */
function withStreamableConnectionAuthorization(
  ctx: MeshContext,
  connectionId: string,
): CallStreamableToolMiddleware {
  return async (request, next) => {
    try {
      const toolName = request.params.name;

      const connectionAccessControl = new AccessControl(
        ctx.authInstance,
        ctx.auth.user?.id ?? ctx.auth.apiKey?.userId,
        toolName,
        ctx.boundAuth, // Bound auth client (encapsulates headers)
        ctx.auth.user?.role,
        connectionId,
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
  const buildRequestHeaders = async (): Promise<Record<string, string>> => {
    // Ensure configuration token is issued (lazy)
    await ensureConfigurationToken();

    const headers: Record<string, string> = {
      ...(callerConnectionId ? { "x-caller-id": callerConnectionId } : {}),
    };

    // Add connection token (already decrypted by storage layer)
    if (connection.connection_token) {
      headers["Authorization"] = `Bearer ${connection.connection_token}`;
    }

    // Add configuration token if issued
    if (configurationToken) {
      headers["x-mesh-token"] = configurationToken;
    }

    // Add custom headers from connection
    if (connection.connection_headers) {
      Object.assign(headers, connection.connection_headers);
    }

    return headers;
  };

  // Create client factory for downstream MCP
  const createClient = async () => {
    const headers = await buildRequestHeaders();

    // Create transport to downstream MCP using StreamableHTTP
    const transport = new StreamableHTTPClientTransport(
      new URL(connection.connection_url),
      { requestInit: { headers } },
    );

    // Create MCP client
    const client = new Client({
      name: "mcp-mesh-proxy",
      version: "1.0.0",
    });

    await client.connect(transport);

    return client;
  };

  // Create authorization middlewares
  // Uses boundAuth for permission checks (delegates to Better Auth)
  const authMiddleware: CallToolMiddleware = superUser
    ? async (_, next) => await next()
    : withConnectionAuthorization(ctx, connectionId);
  const streamableAuthMiddleware: CallStreamableToolMiddleware = superUser
    ? async (_, next) => await next()
    : withStreamableConnectionAuthorization(ctx, connectionId);

  const monitoringConfig: ProxyMonitoringMiddlewareParams = {
    enabled: getMonitoringConfig().enabled,
    connectionId,
    connectionTitle: connection.title,
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
            const result = await client.callTool(request.params);
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
          }
        },
      );
    });
  };

  // List tools from downstream connection
  // Uses indexed tools if available, falls back to client for connections without cached tools
  const listTools = async (): Promise<ListToolsResult> => {
    // Use indexed tools if available
    if (connection.tools && connection.tools.length > 0) {
      return {
        tools: connection.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema as Tool["inputSchema"],
        })),
      };
    }

    // Fall back to client for connections without indexed tools
    const client = await createClient();
    return await client.listTools();
  };

  // List resources from downstream connection
  const listResources = async (): Promise<ListResourcesResult> => {
    const client = await createClient();
    return await client.listResources();
  };

  // Read a specific resource from downstream connection
  const readResource = async (
    params: ReadResourceRequest["params"],
  ): Promise<ReadResourceResult> => {
    const client = await createClient();
    return await client.readResource(params);
  };

  // List resource templates from downstream connection
  const listResourceTemplates =
    async (): Promise<ListResourceTemplatesResult> => {
      const client = await createClient();
      return await client.listResourceTemplates();
    };

  // List prompts from downstream connection
  const listPrompts = async (): Promise<ListPromptsResult> => {
    const client = await createClient();
    return await client.listPrompts();
  };

  // Get a specific prompt from downstream connection
  const getPrompt = async (
    params: GetPromptRequest["params"],
  ): Promise<GetPromptResult> => {
    const client = await createClient();
    return await client.getPrompt(params);
  };

  // Call tool using fetch directly for streaming support
  // Inspired by @deco/api proxy callStreamableTool
  const callStreamableTool = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<Response> => {
    const request: CallToolRequest = {
      method: "tools/call",
      params: { name, arguments: args },
    };
    return callStreamableToolPipeline(request, async (): Promise<Response> => {
      const headers = await buildRequestHeaders();

      // Use fetch directly to support streaming responses
      // Build URL with tool name appended for call-tool endpoint pattern
      const url = new URL(connection.connection_url);
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
      const authResponse = await handleAuthError({
        error: error as Error & { status?: number },
        reqUrl,
        connectionId,
        connectionUrl: connection.connection_url,
        headers: await buildRequestHeaders(),
      });
      if (authResponse) {
        return authResponse;
      }
      throw error;
    }

    // Create MCP server for this proxy
    const server = new McpServer(
      {
        name: "mcp-mesh",
        version: "1.0.0",
      },
      {
        capabilities: { tools: {}, resources: {}, prompts: {} },
      },
    );

    // Create transport (uses HttpServerTransport for fetch Request/Response)
    const transport = new HttpServerTransport({
      enableJsonResponse:
        req.headers.get("Accept")?.includes("application/json") ?? false,
    });

    // Connect server to transport
    await server.connect(transport);

    // Tools handlers
    server.server.setRequestHandler(
      ListToolsRequestSchema,
      async (_request: ListToolsRequest): Promise<ListToolsResult> => {
        return await client.listTools();
      },
    );

    // Set up call tool handler with middleware - reuses executeToolCall
    server.server.setRequestHandler(CallToolRequestSchema, executeToolCall);

    // Resources handlers
    server.server.setRequestHandler(
      ListResourcesRequestSchema,
      async (): Promise<ListResourcesResult> => {
        if (client.getServerCapabilities()?.resources) {
          return await client.listResources();
        }
        return {
          resources: [],
        };
      },
    );

    server.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request: ReadResourceRequest): Promise<ReadResourceResult> => {
        return await client.readResource(request.params);
      },
    );

    server.server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      async (): Promise<ListResourceTemplatesResult> => {
        if (client.getServerCapabilities()?.resourceTemplates) {
          return await client.listResourceTemplates();
        }
        return {
          resourceTemplates: [],
        };
      },
    );

    // Prompts handlers
    server.server.setRequestHandler(
      ListPromptsRequestSchema,
      async (): Promise<ListPromptsResult> => {
        if (client.getServerCapabilities()?.prompts) {
          return await client.listPrompts();
        }
        return {
          prompts: [],
        };
      },
    );

    server.server.setRequestHandler(
      GetPromptRequestSchema,
      async (request: GetPromptRequest): Promise<GetPromptResult> => {
        return await client.getPrompt(request.params);
      },
    );

    // Handle the incoming message
    return await transport.handleMessage(req);
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
    const err = error as Error;

    if (err.message.includes("not found")) {
      return c.json({ error: err.message }, 404);
    }
    if (err.message.includes("does not belong to the active organization")) {
      // Return 404 to prevent leaking connection existence across organizations
      return c.json({ error: "Connection not found" }, 404);
    }
    if (err.message.includes("inactive")) {
      return c.json({ error: err.message }, 503);
    }

    return c.json(
      { error: "Internal server error", message: err.message },
      500,
    );
  }
});

export default app;

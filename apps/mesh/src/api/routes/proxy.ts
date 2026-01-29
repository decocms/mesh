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

import { getMonitoringConfig } from "@/core/config";
import { createClient } from "@/mcp-clients";
import { buildRequestHeaders } from "@/mcp-clients/outbound/headers";
import {
  parseStrategyFromMode,
  type ToolSelectionStrategy,
} from "@/mcp-clients/virtual-mcp";
import type { ConnectionEntity } from "@/tools/connection/schema";
import type { ServerClient } from "@decocms/bindings/mcp";
import { createServerFromClient } from "@decocms/mesh-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  type CallToolRequest,
  type CallToolResult,
  ErrorCode,
  type GetPromptRequest,
  type GetPromptResult,
  type ListPromptsResult,
  type ListResourcesResult,
  type ListResourceTemplatesResult,
  type ListToolsResult,
  McpError,
  type ReadResourceRequest,
  type ReadResourceResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { Context, Hono } from "hono";
import { AccessControl } from "../../core/access-control";
import type { MeshContext } from "../../core/mesh-context";
import { compose } from "../utils/compose";
import { handleVirtualMcpRequest } from "./virtual-mcp";
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
export type MCPProxyClient = Client & {
  callStreamableTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<Response>;
  [Symbol.asyncDispose]: () => Promise<void>;
};

/**
 * Convert MCPProxyClient to ServerClient format for bindings compatibility
 */
export function toServerClient(client: MCPProxyClient): ServerClient {
  return {
    client: {
      callTool: client.callTool.bind(client),
      listTools: client.listTools.bind(client),
    },
    callStreamableTool: client.callStreamableTool.bind(client),
  };
}

const DEFAULT_SERVER_CAPABILITIES = {
  tools: {},
  resources: {},
  prompts: {},
};

async function createMCPProxyDoNotUseDirectly(
  connectionIdOrConnection: string | ConnectionEntity,
  ctx: MeshContext,
  {
    superUser,
    strategy = "passthrough",
  }: { superUser: boolean; strategy?: ToolSelectionStrategy }, // this is basically used for background workers that needs cross-organization access
): Promise<MCPProxyClient> {
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

  // Create client early - needed for listTools and other operations
  const client = await createClient(connection, ctx, { superUser, strategy });

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
    return await client.listTools();
  };

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

  // Core tool execution logic - shared between fetch and callTool
  const executeToolCall = async (
    request: CallToolRequest,
  ): Promise<CallToolResult> => {
    const callToolPipeline = compose(
      createProxyMonitoringMiddleware(monitoringConfig),
      superUser
        ? async (_, next) => await next()
        : withConnectionAuthorization(ctx, connectionId, listTools),
    );

    return callToolPipeline(request, async (): Promise<CallToolResult> => {
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
            "request.id": ctx.metadata.requestId,
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
          }
        },
      );
    });
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

    // Compose middlewares
    const callStreamableToolPipeline = compose(
      createProxyStreamableMonitoringMiddleware(monitoringConfig),
      superUser
        ? async (_, next) => await next()
        : withStreamableConnectionAuthorization(ctx, connectionId, listTools),
    );

    return callStreamableToolPipeline(request, async (): Promise<Response> => {
      const headers = await buildRequestHeaders(connection, ctx, superUser);

      // Add custom headers from connection_headers
      const httpParams = connection.connection_headers;
      if (httpParams && "headers" in httpParams) {
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
            "request.id": ctx.metadata.requestId,
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

  // List resources from downstream connection
  const listResources = async (): Promise<ListResourcesResult> => {
    try {
      return await client.listResources();
    } catch (error) {
      if (
        error instanceof McpError &&
        error.code === ErrorCode.MethodNotFound
      ) {
        return { resources: [] };
      }

      throw error;
    }
  };

  // Read a specific resource from downstream connection
  const readResource = async (
    params: ReadResourceRequest["params"],
  ): Promise<ReadResourceResult> => client.readResource(params);

  // List resource templates from downstream connection
  const listResourceTemplates =
    async (): Promise<ListResourceTemplatesResult> => {
      try {
        return await client.listResourceTemplates();
      } catch (error) {
        if (
          error instanceof McpError &&
          error.code === ErrorCode.MethodNotFound
        ) {
          return { resourceTemplates: [] };
        }

        throw error;
      }
    };

  // List prompts from downstream connection
  const listPrompts = async (): Promise<ListPromptsResult> => {
    try {
      return await client.listPrompts();
    } catch (error) {
      if (
        error instanceof McpError &&
        error.code === ErrorCode.MethodNotFound
      ) {
        return { prompts: [] };
      }

      throw error;
    }
  };

  // Get a specific prompt from downstream connection
  const getPrompt = async (
    params: GetPromptRequest["params"],
  ): Promise<GetPromptResult> => client.getPrompt(params);

  // We are currently exposing the underlying client with tools/resources/prompts capabilities
  // This way we have an uniform API the frontend can leverage from.
  // Frontend connects to mesh. It's garatee that all mcps have the necessary capabilities. The UI works consistently.
  const getServerCapabilities = () => DEFAULT_SERVER_CAPABILITIES;

  return {
    callTool: (params: CallToolRequest["params"]) =>
      executeToolCall({
        method: "tools/call",
        params,
      }),
    listTools,
    listResources,
    readResource,
    listResourceTemplates,
    listPrompts,
    getPrompt,
    getServerCapabilities,
    getInstructions: () => client.getInstructions(),
    close: () => client.close(),
    callStreamableTool,
    [Symbol.asyncDispose]: () => client.close(),
  } as MCPProxyClient;
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
  strategy?: ToolSelectionStrategy,
) {
  return createMCPProxyDoNotUseDirectly(connectionIdOrConnection, ctx, {
    superUser: false,
    strategy,
  });
}

/**
 * Create a MCP proxy for a downstream connection with super user access
 * @param connectionIdOrConnection - The connection ID or connection entity
 * @param ctx - The mesh context
 * @param strategy - Optional tool selection strategy
 * @returns The MCP proxy
 */
export async function dangerouslyCreateSuperUserMCPProxy(
  connectionIdOrConnection: string | ConnectionEntity,
  ctx: MeshContext,
  strategy?: ToolSelectionStrategy,
) {
  return createMCPProxyDoNotUseDirectly(connectionIdOrConnection, ctx, {
    superUser: true,
    strategy,
  });
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Default MCP endpoint - serves Decopilot virtual MCP (aggregates all org connections)
 *
 * Route: POST /mcp
 * Uses the Decopilot default virtual MCP which excludes Mesh MCP and org registry
 */
app.all("/", async (c) => {
  return handleVirtualMcpRequest(c, undefined);
});

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
    try {
      // Parse strategy from query string mode parameter (defaults to passthrough)
      const strategy = parseStrategyFromMode(c.req.query("mode"));
      const client = await ctx.createMCPProxy(connectionId, strategy);

      // Create server from client using the bridge
      const server = createServerFromClient(client, {
        name: "mcp-mesh",
        version: "1.0.0",
      });

      // Create transport
      const transport = new WebStandardStreamableHTTPServerTransport({
        enableJsonResponse:
          c.req.raw.headers.get("Accept")?.includes("application/json") ??
          false,
      });

      // Connect server to transport
      await server.connect(transport);

      // Handle request and cleanup
      return await transport.handleRequest(c.req.raw);
    } catch (error) {
      // Check if this is an auth error - if so, return appropriate 401
      // Note: This only applies to HTTP connections
      const connection = await ctx.storage.connections.findById(
        connectionId,
        ctx.organization?.id,
      );
      if (connection?.connection_url) {
        const authResponse = await handleAuthError({
          error: error as Error & { status?: number },
          reqUrl: new URL(c.req.raw.url),
          connectionId,
          connectionUrl: connection.connection_url,
          headers: {}, // Headers are built internally by createMCPProxy
        });
        if (authResponse) {
          return authResponse;
        }
      }
      throw error;
    }
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
    // Parse strategy from query string mode parameter (defaults to passthrough)
    const strategy = parseStrategyFromMode(c.req.query("mode"));
    const client = await ctx.createMCPProxy(connectionId, strategy);
    const result = await client.callTool({
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

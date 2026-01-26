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
import {
  buildRequestHeaders,
  createClientByConnectionType,
  type DisposableClient,
} from "@/mcp-clients";
import {
  ConnectionEntity,
  type HttpConnectionParameters,
  isStdioParameters,
  type StdioConnectionParameters,
} from "@/tools/connection/schema";
import { createMcpServerBridge } from "@decocms/mesh-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  type CallToolRequest,
  CallToolRequestSchema,
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
import { handleVirtualMcpRequest } from "./gateway";
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
  { bypassAuth }: { bypassAuth: boolean }, // this is basically used for background workers that needs cross-organization access
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

  // Build request headers function - reusable for both client and direct fetch
  // Uses the exported buildRequestHeaders from network-transport.ts
  const buildRequestHeadersFn = buildRequestHeaders({ connection, ctx });

  // Determine connection type and extract parameters
  const isStdio = connection.connection_type === "STDIO";
  const stdioParams: StdioConnectionParameters | null = isStdioParameters(
    connection.connection_headers,
  )
    ? connection.connection_headers
    : null;
  const httpParams: HttpConnectionParameters | null = !isStdio
    ? (connection.connection_headers as HttpConnectionParameters | null)
    : null;
  const isHttpLikeConnection =
    connection.connection_type === "HTTP" ||
    connection.connection_type === "SSE" ||
    connection.connection_type === "Websocket";

  // Create client factory for downstream MCP based on connection_type
  const createConnectionClientInternal =
    async (): Promise<DisposableClient> => {
      return createClientByConnectionType({
        connection,
        connectionId,
        stdioParams,
        httpParams,
        bypassAuth,
        ctx,
      });
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
    let client:
      | Awaited<ReturnType<typeof createConnectionClientInternal>>
      | undefined;
    try {
      client = await createConnectionClientInternal();
      return await client.listTools();
    } finally {
      if (client) {
        const dispose = (client as { [Symbol.asyncDispose]?: () => Promise<void> })[Symbol.asyncDispose];
        if (dispose) {
          dispose().catch(console.error);
        } else {
          client.close().catch(console.error);
        }
      }
    }
  };

  // Create authorization middlewares
  // Uses boundAuth for permission checks (delegates to Better Auth)
  // Pass listTools for public tool check
  const shouldAuth = !bypassAuth && isHttpLikeConnection;
  const authMiddleware: CallToolMiddleware = shouldAuth
    ? withConnectionAuthorization(ctx, connectionId, listTools)
    : async (_, next) => await next();
  const streamableAuthMiddleware: CallStreamableToolMiddleware = shouldAuth
    ? withStreamableConnectionAuthorization(ctx, connectionId, listTools)
    : async (_, next) => await next();

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
      const client = await createConnectionClientInternal();
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
          } finally {
            // Close client - stdio connections ignore close() via stable-transport
            if (client) {
        const dispose = (client as { [Symbol.asyncDispose]?: () => Promise<void> })[Symbol.asyncDispose];
        if (dispose) {
          dispose().catch(console.error);
        } else {
          client.close().catch(console.error);
        }
      }
          }
        },
      );
    });
  };

  // List resources from downstream connection
  const listResources = async (): Promise<ListResourcesResult> => {
    let client:
      | Awaited<ReturnType<typeof createConnectionClientInternal>>
      | undefined;
    try {
      client = await createConnectionClientInternal();
      return await client.listResources();
    } catch (error) {
      if (
        error instanceof McpError &&
        error.code === ErrorCode.MethodNotFound
      ) {
        return { resources: [] };
      }

      throw error;
    } finally {
      if (client) {
        const dispose = (client as { [Symbol.asyncDispose]?: () => Promise<void> })[Symbol.asyncDispose];
        if (dispose) {
          dispose().catch(console.error);
        } else {
          client.close().catch(console.error);
        }
      }
    }
  };

  // Read a specific resource from downstream connection
  const readResource = async (
    params: ReadResourceRequest["params"],
  ): Promise<ReadResourceResult> => {
    let client:
      | Awaited<ReturnType<typeof createConnectionClientInternal>>
      | undefined;
    try {
      client = await createConnectionClientInternal();
      return await client.readResource(params);
    } finally {
      if (client) {
        const dispose = (client as { [Symbol.asyncDispose]?: () => Promise<void> })[Symbol.asyncDispose];
        if (dispose) {
          dispose().catch(console.error);
        } else {
          client.close().catch(console.error);
        }
      }
    }
  };

  // List resource templates from downstream connection
  const listResourceTemplates =
    async (): Promise<ListResourceTemplatesResult> => {
      let client:
        | Awaited<ReturnType<typeof createConnectionClientInternal>>
        | undefined;
      try {
        client = await createConnectionClientInternal();
        return await client.listResourceTemplates();
      } catch (error) {
        if (
          error instanceof McpError &&
          error.code === ErrorCode.MethodNotFound
        ) {
          return { resourceTemplates: [] };
        }

        throw error;
      } finally {
        if (client) {
        const dispose = (client as { [Symbol.asyncDispose]?: () => Promise<void> })[Symbol.asyncDispose];
        if (dispose) {
          dispose().catch(console.error);
        } else {
          client.close().catch(console.error);
        }
      }
      }
    };

  // List prompts from downstream connection
  const listPrompts = async (): Promise<ListPromptsResult> => {
    let client:
      | Awaited<ReturnType<typeof createConnectionClientInternal>>
      | undefined;
    try {
      client = await createConnectionClientInternal();
      return await client.listPrompts();
    } catch (error) {
      if (
        error instanceof McpError &&
        error.code === ErrorCode.MethodNotFound
      ) {
        return { prompts: [] };
      }

      throw error;
    } finally {
      if (client) {
        const dispose = (client as { [Symbol.asyncDispose]?: () => Promise<void> })[Symbol.asyncDispose];
        if (dispose) {
          dispose().catch(console.error);
        } else {
          client.close().catch(console.error);
        }
      }
    }
  };

  // Get a specific prompt from downstream connection
  const getPrompt = async (
    params: GetPromptRequest["params"],
  ): Promise<GetPromptResult> => {
    let client:
      | Awaited<ReturnType<typeof createConnectionClientInternal>>
      | undefined;
    try {
      client = await createConnectionClientInternal();
      return await client.getPrompt(params);
    } finally {
      if (client) {
        const dispose = (client as { [Symbol.asyncDispose]?: () => Promise<void> })[Symbol.asyncDispose];
        if (dispose) {
          dispose().catch(console.error);
        } else {
          client.close().catch(console.error);
        }
      }
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
      const headers = await buildRequestHeadersFn();

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

  // Create fetch function that handles MCP protocol
  const handleMcpRequest = async (req: Request) => {
    // Create client once - throws HTTPException for auth errors
    const reqUrl = new URL(req.url);
    let client: Awaited<ReturnType<typeof createConnectionClientInternal>>;
    try {
      client = await createConnectionClientInternal();
    } catch (error) {
      // Check if this is an auth error - if so, return appropriate 401
      // Note: This only applies to HTTP connections
      const authResponse = connection.connection_url
        ? await handleAuthError({
            error: error as Error & { status?: number },
            reqUrl,
            connectionId,
            connectionUrl: connection.connection_url,
            headers: await buildRequestHeadersFn(),
          })
        : null;
      if (authResponse) {
        return authResponse;
      }
      throw error;
    }

    const instructions = client.getInstructions?.();
    const server = createMcpServerBridge(client as Client, {
      name: "mcp-mesh",
      version: "1.0.0",
      instructions,
    });

    // Create transport (web-standard Streamable HTTP for fetch Request/Response)
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse:
        req.headers.get("Accept")?.includes("application/json") ?? false,
    });

    // Connect server to transport
    await server.connect(transport);

    // Set up call tool handler with middleware - reuses executeToolCall
    server.server.setRequestHandler(CallToolRequestSchema, executeToolCall);

    // Handle the incoming message
    // CRITICAL: Use try/finally to ensure BOTH transport AND client are closed after request
    // Without this, ReadableStream/WritableStream controllers and TextDecoderStream accumulate in memory
    try {
      return await transport.handleRequest(req);
    } finally {
      // Close the downstream client to release HTTP transport streams (TextDecoderStream, etc.)
      // This is critical - the client created at the start of handleMcpRequest was never being closed!
      try {
        const dispose = (client as any)[Symbol.asyncDispose] as
          | (() => Promise<void>)
          | undefined;
        if (dispose) {
          await dispose();
        } else {
          await client.close();
        }
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

export async function createConnectionClient(
  connectionIdOrConnection: string | ConnectionEntity,
  ctx: MeshContext,
  { bypassAuth = false }: { bypassAuth?: boolean } = {},
): Promise<Client> {
  const proxy = await createMCPProxyDoNotUseDirectly(
    connectionIdOrConnection,
    ctx,
    {
      bypassAuth,
    },
  );
  const client = proxy.client as Client & {
    close?: () => Promise<void>;
    [Symbol.dispose]?: () => Promise<void>;
  };

  if (!client.close) {
    client.close = async () => {};
  }
  client[Symbol.dispose] = async () => {
    await client.close?.();
  };

  return client;
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
  return createMCPProxyDoNotUseDirectly(
    connectionIdOrConnection,
    ctx,
    { bypassAuth: false },
  );
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
    bypassAuth: true,
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
    // Otherwise proxy to downstream
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

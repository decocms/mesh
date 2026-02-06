/**
 * Streaming Support Decorator
 *
 * Adds streaming support to an MCP client by extending it with a custom
 * callStreamableTool method for HTTP streaming. This separation keeps MCP
 * spec functionality separate from Mesh-specific extensions.
 */

import { buildRequestHeaders } from "@/mcp-clients/outbound/headers";
import type { ConnectionEntity } from "@/tools/connection/schema";
import { AccessControl } from "@/core/access-control";
import type { MeshContext } from "@/core/mesh-context";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";

/**
 * MCP Client extended with streaming support
 * Adds callStreamableTool method for HTTP streaming responses
 */
export type ClientWithStreamingSupport = Client & {
  callStreamableTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<Response>;
};

/**
 * MCP Client with optional streaming support
 * Used when streaming may or may not be available
 */
export type ClientWithOptionalStreamingSupport = Client & {
  callStreamableTool?: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<Response>;
};

/**
 * Streamable authorization middleware - checks access to tool on connection
 * Returns Response instead of CallToolResult for streaming use cases
 *
 * Supports public tools: if tool._meta["mcp.mesh"].public_tool is true,
 * unauthenticated requests are allowed through.
 */
type CallStreamableToolMiddleware = (
  request: CallToolRequest,
  next: () => Promise<Response>,
) => Promise<Response>;

function withStreamableConnectionAuthorization(
  ctx: MeshContext,
  connectionId: string,
  listToolsFn: () => Promise<{
    tools: Array<{ name: string; _meta?: unknown }>;
  }>,
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

/**
 * Decorator function that adds streaming support to an MCP client
 *
 * This extends a pure MCP spec-compliant client with the custom callStreamableTool
 * method for HTTP streaming. This separation keeps MCP spec functionality separate
 * from Mesh-specific extensions.
 *
 * @param client - The base MCP client (MCP spec-compliant)
 * @param connectionId - The connection ID
 * @param connection - The connection entity
 * @param ctx - The mesh context
 * @param options - Options including superUser flag
 * @returns A client with streaming support added
 */
export function withStreamingSupport(
  client: Client,
  connectionId: string,
  connection: ConnectionEntity,
  ctx: MeshContext,
  options: { superUser: boolean },
): ClientWithStreamingSupport {
  // Call tool using fetch directly for streaming support
  // Inspired by @deco/api proxy callStreamableTool
  // Note: Only works for HTTP connections - STDIO and VIRTUAL don't support streaming fetch
  const callStreamableTool = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<Response> => {
    // VIRTUAL connections don't support streamable tools - fall back to regular call
    if (connection.connection_type === "VIRTUAL") {
      const result = await client.callTool({
        name,
        arguments: args,
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

    // Authorization check for streaming (bypasses transport layer)
    if (!options.superUser) {
      const authMiddleware = withStreamableConnectionAuthorization(
        ctx,
        connectionId,
        client.listTools.bind(client),
      );
      const authResult = await authMiddleware(request, async () => {
        // Return a placeholder response - we only care about auth check
        return new Response();
      });
      // If auth middleware returned an error response, return it
      if (!authResult.ok) {
        return authResult;
      }
    }

    // Execute streaming fetch
    const headers = await buildRequestHeaders(
      connection,
      ctx,
      options.superUser,
    );

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

    // Sanitize arguments to remove non-serializable fields
    // This ensures JSON.stringify works correctly
    const sanitizedArgs = JSON.parse(
      JSON.stringify(request.params.arguments, (_key, value) => {
        // Filter out non-serializable values
        if (value instanceof AbortSignal) {
          return undefined; // AbortSignal is used client-side only
        }
        // Filter out functions, symbols, undefined
        if (typeof value === "function" || typeof value === "symbol") {
          return undefined;
        }
        // Filter out undefined values (they can cause issues in some parsers)
        if (value === undefined) {
          return undefined;
        }
        return value;
      }),
    );

    const requestBody = JSON.stringify(sanitizedArgs);

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
            body: requestBody,
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

          console.error("[with-streaming-support] fetch error", {
            connectionId,
            toolName: request.params.name,
            error: err.message,
            errorStack: err.stack,
            duration,
          });

          ctx.meter
            .createHistogram("connection.proxy.streamable.duration")
            .record(duration, {
              "connection.id": connectionId,
              "tool.name": request.params.name,
              status: "error",
            });

          ctx.meter.createCounter("connection.proxy.streamable.errors").add(1, {
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
  };

  // Create a new object with the same prototype as the client
  // This preserves prototype methods while allowing us to add our custom method
  const extendedClient = Object.assign(
    Object.create(Object.getPrototypeOf(client)),
    client,
  );
  extendedClient.callStreamableTool = callStreamableTool;

  return extendedClient as ClientWithStreamingSupport;
}

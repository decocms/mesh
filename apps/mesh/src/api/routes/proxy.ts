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

import { clientFromConnection, serverFromConnection } from "@/mcp-clients";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Context, Hono } from "hono";
import { endTime, startTime } from "hono/timing";
import type { MeshContext } from "../../core/mesh-context";
import { managementMCP } from "../../tools";
import { handleAuthError } from "./oauth-proxy";
import { handleVirtualMcpRequest } from "./virtual-mcp";
export { toServerClient, type MCPProxyClient } from "./mcp-proxy-factory";

// Define Hono variables type
type Variables = {
  meshContext: MeshContext;
};

const app = new Hono<{ Variables: Variables }>();

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

  // SELF MCP connections ({orgId}_self) route to the management MCP server
  // instead of creating an outbound client connection
  if (connectionId.endsWith("_self")) {
    const selfOrgId = connectionId.slice(0, -"_self".length);
    if (!ctx.organization || ctx.organization.id !== selfOrgId) {
      return c.json({ error: "Connection not found" }, 404);
    }
    const server = await managementMCP(ctx);
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse:
        c.req.raw.headers.get("Accept")?.includes("application/json") ?? false,
    });
    await server.connect(transport);
    return await transport.handleRequest(c.req.raw);
  }

  try {
    try {
      // Organization context is required — without it the ownership
      // check below would be skipped, allowing cross-tenant access.
      if (!ctx.organization?.id) {
        return c.json({ error: "Organization context is required" }, 403);
      }

      // Fetch connection scoped to the caller's organization
      startTime(c, "mcp.find_connection");
      const connection = await ctx.storage.connections.findById(
        connectionId,
        ctx.organization.id,
      );
      endTime(c, "mcp.find_connection");
      if (!connection) {
        throw new Error("Connection not found");
      }

      // Validate organization ownership
      if (connection.organization_id !== ctx.organization.id) {
        throw new Error(
          "Connection does not belong to the active organization",
        );
      }

      // Check connection status
      if (connection.status !== "active") {
        throw new Error(`Connection inactive: ${connection.status}`);
      }

      // For HTTP connections, eagerly attempt the upstream MCP handshake to
      // surface auth errors (e.g. OAuth 401). The lazy client inside
      // serverFromConnection defers the connection, so without this probe
      // the proxy would handle "initialize" locally and return 200 OK —
      // hiding the 401 the frontend needs to trigger the OAuth popup.
      // On success this also warms the per-request client pool, so the
      // lazy client reuses the same connection instead of double-connecting.
      if (connection.connection_url) {
        startTime(c, "mcp.client_handshake");
        await clientFromConnection(connection, ctx, false);
        endTime(c, "mcp.client_handshake");
      }

      // Create enhanced server directly (no need for bridge - server is used directly!)
      startTime(c, "mcp.create_server");
      const server = serverFromConnection(connection, ctx, false);
      endTime(c, "mcp.create_server");

      // Create HTTP transport
      const transport = new WebStandardStreamableHTTPServerTransport({
        enableJsonResponse:
          c.req.raw.headers.get("Accept")?.includes("application/json") ??
          false,
      });

      // Connect server to transport
      startTime(c, "mcp.server_connect");
      await server.connect(transport);
      endTime(c, "mcp.server_connect");

      // Handle request and cleanup
      startTime(c, "mcp.handle_request");
      const response = await transport.handleRequest(c.req.raw);
      endTime(c, "mcp.handle_request");
      return response;
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
          headers: {}, // Headers are built internally by createEnhancedServer
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
    // Fetch connection and create client directly
    const connection = await ctx.storage.connections.findById(
      connectionId,
      ctx.organization?.id,
    );
    if (!connection) {
      return c.json({ error: "Connection not found" }, 404);
    }

    // Client pool manages lifecycle, no need for await using
    const client = await clientFromConnection(connection, ctx, false);
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

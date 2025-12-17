/**
 * MCP Mesh Aggregated Endpoint
 *
 * Aggregates tools from all connections in the organization into a single MCP server.
 * Only tools with conflicting names are prefixed with connection IDs.
 *
 * Architecture:
 * - Lists all active connections for the organization
 * - Creates proxies for each connection using createMCPProxy
 * - Composes them into a single ServerClient interface
 * - Smart prefixing: only conflicting tool names get prefixed (connectionId::toolName)
 */

import type { ServerClient } from "@decocms/bindings/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type CallToolResult,
  type ListToolsRequest,
  type ListToolsResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { Hono } from "hono";
import type { MeshContext } from "../../core/mesh-context";
import type { ConnectionEntity } from "../../tools/connection/schema";
import { HttpServerTransport } from "../http-server-transport";
import { createMCPProxy } from "./proxy";

// Define Hono variables type
type Variables = {
  meshContext: MeshContext;
};

const app = new Hono<{ Variables: Variables }>();

// ============================================================================
// Types
// ============================================================================

/** Maps final tool name -> { connectionId, originalName, proxy } */
interface ToolMapping {
  connectionId: string;
  originalName: string;
}

/** Result from listing tools from a single connection */
interface ConnectionToolsResult {
  connectionId: string;
  connectionTitle: string;
  tools: Tool[];
  proxy: Awaited<ReturnType<typeof createMCPProxy>>;
}

// ============================================================================
// Compose MCP Proxies
// ============================================================================

/**
 * Compose multiple MCP proxies into a single ServerClient interface.
 *
 * - Lists tools from all connections in parallel
 * - Detects conflicting tool names and prefixes only those
 * - Routes tool calls to the appropriate underlying proxy
 *
 * @param connections - Active connections to compose
 * @param ctx - Mesh context for creating proxies
 * @returns ServerClient interface with aggregated tools
 */
export async function composeMCPProxies(
  connections: ConnectionEntity[],
  ctx: MeshContext,
): Promise<ServerClient> {
  // Create proxies for all connections in parallel
  const proxyResults = await Promise.allSettled(
    connections.map(async (conn) => {
      try {
        const proxy = await createMCPProxy(conn, ctx);
        return { connection: conn, proxy };
      } catch (error) {
        console.error(
          `[mesh] Failed to create proxy for connection ${conn.id}:`,
          error,
        );
        return null;
      }
    }),
  );

  // Filter successful proxies
  const proxies = new Map<
    string,
    {
      proxy: Awaited<ReturnType<typeof createMCPProxy>>;
      connection: ConnectionEntity;
    }
  >();
  for (const result of proxyResults) {
    if (result.status === "fulfilled" && result.value) {
      proxies.set(result.value.connection.id, result.value);
    }
  }

  // Tool mapping state - populated when listTools is called
  let toolMappings: Map<string, ToolMapping> | null = null;

  /**
   * List tools from all proxies, detect conflicts, and apply smart prefixing
   */
  const listTools = async (): Promise<ListToolsResult> => {
    // Fetch tools from all proxies in parallel
    const toolResults = await Promise.allSettled(
      Array.from(proxies.entries()).map(
        async ([connectionId, { proxy, connection }]) => {
          try {
            const result = await proxy.client.listTools();
            return {
              connectionId,
              connectionTitle: connection.title,
              tools: result.tools,
              proxy,
            } as ConnectionToolsResult;
          } catch (error) {
            console.error(
              `[mesh] Failed to list tools for connection ${connectionId}:`,
              error,
            );
            return null;
          }
        },
      ),
    );

    // Collect successful results
    const allConnectionTools: ConnectionToolsResult[] = [];
    for (const result of toolResults) {
      if (result.status === "fulfilled" && result.value) {
        allConnectionTools.push(result.value);
      }
    }

    // Count occurrences of each tool name to detect conflicts
    const toolNameCounts = new Map<string, number>();
    for (const { tools } of allConnectionTools) {
      for (const tool of tools) {
        toolNameCounts.set(tool.name, (toolNameCounts.get(tool.name) || 0) + 1);
      }
    }

    // Build final tool list with smart prefixing
    const finalTools: Tool[] = [];
    const mappings = new Map<string, ToolMapping>();

    for (const { connectionId, connectionTitle, tools } of allConnectionTools) {
      for (const tool of tools) {
        const isConflict = (toolNameCounts.get(tool.name) ?? 0) > 1;
        const finalName = isConflict
          ? `${connectionId}::${tool.name}`
          : tool.name;

        // Add connection context to description for conflicting tools
        const description = isConflict
          ? `[${connectionTitle}] ${tool.description || ""}`
          : tool.description;

        finalTools.push({
          ...tool,
          name: finalName,
          description,
        });

        mappings.set(finalName, {
          connectionId,
          originalName: tool.name,
        });
      }
    }

    // Cache the mappings for subsequent callTool requests
    toolMappings = mappings;

    return { tools: finalTools };
  };

  /**
   * Call a tool, resolving the final name to the correct proxy and original name
   */
  const callTool = async (
    params: CallToolRequest["params"],
  ): Promise<CallToolResult> => {
    const { name: toolName, arguments: args } = params;

    // Ensure we have tool mappings (call listTools if not cached)
    if (!toolMappings) {
      await listTools();
    }

    // Look up the mapping for this tool
    const mapping = toolMappings?.get(toolName);
    if (!mapping) {
      return {
        content: [
          {
            type: "text",
            text: `Tool not found: ${toolName}`,
          },
        ],
        isError: true,
      };
    }

    // Get the proxy for this connection
    const proxyEntry = proxies.get(mapping.connectionId);
    if (!proxyEntry) {
      return {
        content: [
          {
            type: "text",
            text: `Connection not found for tool: ${toolName}`,
          },
        ],
        isError: true,
      };
    }

    // Call the tool with the ORIGINAL name (unprefixed)
    // The underlying proxy handles authorization
    const result = await proxyEntry.proxy.client.callTool({
      name: mapping.originalName,
      arguments: args,
    });

    return result as CallToolResult;
  };

  /**
   * Call a streamable tool, resolving to the correct proxy
   */
  const callStreamableTool = async (
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<Response> => {
    // Ensure we have tool mappings
    if (!toolMappings) {
      await listTools();
    }

    // Look up the mapping
    const mapping = toolMappings?.get(toolName);
    if (!mapping) {
      return new Response(
        JSON.stringify({ error: `Tool not found: ${toolName}` }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    // Get the proxy
    const proxyEntry = proxies.get(mapping.connectionId);
    if (!proxyEntry) {
      return new Response(
        JSON.stringify({
          error: `Connection not found for tool: ${toolName}`,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    // Call with ORIGINAL name (unprefixed)
    return proxyEntry.proxy.callStreamableTool(mapping.originalName, args);
  };

  return {
    client: {
      listTools,
      callTool,
    },
    callStreamableTool,
  };
}

// ============================================================================
// MCP Mesh Server Factory
// ============================================================================

/**
 * Create an MCP server that aggregates all organization connections
 *
 * @param organizationSlug - Organization slug from path parameter
 * @param ctx - Mesh context (organization will be set from path parameter)
 */
async function createMeshMCPServer(organizationSlug: string, ctx: MeshContext) {
  // Query organization by slug
  const organization = await ctx.db
    .selectFrom("organization")
    .select(["id", "slug", "name"])
    .where("slug", "=", organizationSlug)
    .executeTakeFirst();

  if (!organization) {
    throw new Error(`Organization not found: ${organizationSlug}`);
  }

  // Set organization context from query result
  ctx.organization = {
    id: organization.id,
    slug: organization.slug,
    name: organization.name,
  };

  // List all active connections for the organization
  const allConnections = await ctx.storage.connections.list(organization.id);
  const activeConnections = allConnections.filter(
    (conn) => conn.status === "active",
  );

  if (activeConnections.length === 0) {
    // Return empty ServerClient if no connections
    return {
      client: {
        listTools: async (): Promise<ListToolsResult> => ({ tools: [] }),
        callTool: async (): Promise<CallToolResult> => ({
          content: [{ type: "text", text: "No connections available" }],
          isError: true,
        }),
      },
      callStreamableTool: async (): Promise<Response> =>
        new Response(JSON.stringify({ error: "No connections available" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
    };
  }

  // Compose all proxies
  return composeMCPProxies(activeConnections, ctx);
}

// ============================================================================
// Route Handler
// ============================================================================

/**
 * MCP Mesh endpoint - aggregates all organization connections
 *
 * Route: POST /mcp/mesh/:organizationSlug
 * Exposes tools from all active connections in the specified organization
 */
app.all("/:organizationSlug", async (c) => {
  const organizationSlug = c.req.param("organizationSlug");
  const ctx = c.get("meshContext");

  try {
    const composedClient = await createMeshMCPServer(organizationSlug, ctx);

    // Create MCP server that uses the composed client
    const server = new McpServer(
      {
        name: "mcp-mesh-aggregated",
        version: "1.0.0",
      },
      {
        capabilities: { tools: {} },
      },
    );

    // Create transport
    const transport = new HttpServerTransport({
      enableJsonResponse:
        c.req.header("Accept")?.includes("application/json") ?? false,
    });

    // Connect server to transport
    await server.connect(transport);

    // Handle list_tools - delegate to composed client
    server.server.setRequestHandler(
      ListToolsRequestSchema,
      async (_request: ListToolsRequest): Promise<ListToolsResult> => {
        return composedClient.client.listTools();
      },
    );

    // Handle call_tool - delegate to composed client
    server.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: CallToolRequest): Promise<CallToolResult> => {
        return (await composedClient.client.callTool(
          request.params,
        )) as CallToolResult;
      },
    );

    // Handle the incoming MCP message
    return await transport.handleMessage(c.req.raw);
  } catch (error) {
    const err = error as Error;

    if (err.message.includes("Organization not found")) {
      return c.json({ error: err.message }, 404);
    }

    console.error("[mesh] Error handling mesh request:", err);
    return c.json(
      { error: "Internal server error", message: err.message },
      500,
    );
  }
});

export default app;

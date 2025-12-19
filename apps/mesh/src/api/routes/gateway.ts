/**
 * MCP Gateway Routes
 *
 * Provides two types of gateway endpoints:
 * 1. Virtual Gateway - Uses gateway entity from database at /mcp/gateway/:gatewayId
 * 2. Mesh Gateway (deprecated) - Aggregates all org connections at /mcp/mesh/:organizationSlug
 *
 * Architecture:
 * - Lists connections for the gateway (from database or organization)
 * - Creates proxies for each connection using createMCPProxy
 * - Composes them into a single ServerClient interface
 * - Always deduplicates tools by name (first occurrence wins)
 * - Supports exclusion strategy for inverse tool selection
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
import type {
  GatewayWithConnections,
  ToolSelectionStrategy,
} from "../../storage/types";
import type { ConnectionEntity } from "../../tools/connection/schema";
import type { Env } from "../env";
import { HttpServerTransport } from "../http-server-transport";
import { createMCPProxy } from "./proxy";

// Define Hono variables type
const app = new Hono<Env>();

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

/** Gateway configuration for createMCPGateway */
interface GatewayOptions {
  connections: Array<{
    connection: ConnectionEntity;
    selectedTools: string[] | null; // null = all tools (or full exclusion if strategy is "exclusion")
  }>;
  toolSelectionStrategy: ToolSelectionStrategy;
}

// ============================================================================
// Tool Deduplication
// ============================================================================

/**
 * Deduplicate tools by name (first occurrence wins)
 * @param allConnectionTools - All tools from connections
 * @returns Deduplicated tools and mappings
 */
function deduplicateTools(allConnectionTools: ConnectionToolsResult[]): {
  tools: Tool[];
  mappings: Map<string, ToolMapping>;
} {
  const mappings = new Map<string, ToolMapping>();
  const finalTools: Tool[] = [];
  const seenNames = new Set<string>();

  for (const { connectionId, tools } of allConnectionTools) {
    for (const tool of tools) {
      if (!seenNames.has(tool.name)) {
        seenNames.add(tool.name);
        finalTools.push(tool);
        mappings.set(tool.name, {
          connectionId,
          originalName: tool.name,
        });
      }
    }
  }

  return { tools: finalTools, mappings };
}

// ============================================================================
// MCP Gateway Factory
// ============================================================================

/**
 * Create an MCP gateway that aggregates tools from multiple connections
 *
 * @param options - Gateway configuration (connections with selected tools and strategy)
 * @param ctx - Mesh context for creating proxies
 * @returns ServerClient interface with aggregated tools
 */
async function createMCPGateway(
  options: GatewayOptions,
  ctx: MeshContext,
): Promise<ServerClient> {
  // Create proxies for all connections in parallel
  const proxyResults = await Promise.allSettled(
    options.connections.map(async ({ connection, selectedTools }) => {
      try {
        const proxy = await createMCPProxy(connection, ctx);
        return { connection, proxy, selectedTools };
      } catch (error) {
        console.error(
          `[gateway] Failed to create proxy for connection ${connection.id}:`,
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
      selectedTools: string[] | null;
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
   * List tools from all proxies, apply selection strategy, and deduplicate
   */
  const listTools = async (): Promise<ListToolsResult> => {
    // Fetch tools from all proxies in parallel
    const toolResults = await Promise.allSettled(
      Array.from(proxies.entries()).map(
        async ([connectionId, { proxy, connection, selectedTools }]) => {
          try {
            const result = await proxy.client.listTools();

            // Apply selection based on strategy
            let tools = result.tools;

            if (options.toolSelectionStrategy === "exclusion") {
              // Exclusion mode: remove selected tools (or all if selectedTools is null/empty)
              if (selectedTools && selectedTools.length > 0) {
                const excludeSet = new Set(selectedTools);
                tools = tools.filter((t) => !excludeSet.has(t.name));
              }
              // If selectedTools is null/empty in exclusion mode, all tools are removed
              // (this connection is fully excluded - handled by not including it)
            } else {
              // Include mode (default): keep only selected tools (or all if null)
              if (selectedTools && selectedTools.length > 0) {
                const selectedSet = new Set(selectedTools);
                tools = tools.filter((t) => selectedSet.has(t.name));
              }
              // If selectedTools is null, all tools are included
            }

            return {
              connectionId,
              connectionTitle: connection.title,
              tools,
              proxy,
            } as ConnectionToolsResult;
          } catch (error) {
            console.error(
              `[gateway] Failed to list tools for connection ${connectionId}:`,
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

    // Always deduplicate (first occurrence wins)
    const { tools: finalTools, mappings } =
      deduplicateTools(allConnectionTools);

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
// Helper to create MCP gateway from database entity
// ============================================================================

/**
 * Load gateway entity and create MCP gateway
 * Handles both include and exclusion strategies
 */
async function createMCPGatewayFromEntity(
  gateway: GatewayWithConnections,
  ctx: MeshContext,
): Promise<ServerClient> {
  let connections: Array<{
    connection: ConnectionEntity;
    selectedTools: string[] | null;
  }>;

  if (gateway.toolSelectionStrategy === "exclusion") {
    // Exclusion mode: list ALL org connections, then apply exclusion filter
    const allConnections = await ctx.storage.connections.list(
      gateway.organizationId,
    );
    const activeConnections = allConnections.filter(
      (c) => c.status === "active",
    );

    // Build a map of connection exclusions
    const exclusionMap = new Map<string, string[] | null>();
    for (const gwConn of gateway.connections) {
      exclusionMap.set(gwConn.connectionId, gwConn.selectedTools);
    }

    connections = [];
    for (const conn of activeConnections) {
      const exclusionEntry = exclusionMap.get(conn.id);

      if (exclusionEntry === undefined) {
        // Connection NOT in gateway.connections -> include all tools
        connections.push({ connection: conn, selectedTools: null });
      } else if (exclusionEntry === null || exclusionEntry.length === 0) {
        // Connection in gateway.connections with null/empty selectedTools -> exclude entire connection
        // Skip this connection
      } else {
        // Connection in gateway.connections with specific tools -> exclude those tools
        connections.push({ connection: conn, selectedTools: exclusionEntry });
      }
    }
  } else {
    // Include mode (default): use only the connections specified in gateway
    const connectionIds = gateway.connections.map((c) => c.connectionId);
    const loadedConnections: ConnectionEntity[] = [];

    for (const connId of connectionIds) {
      const conn = await ctx.storage.connections.findById(connId);
      if (conn && conn.status === "active") {
        loadedConnections.push(conn);
      }
    }

    connections = loadedConnections.map((conn) => {
      const gwConn = gateway.connections.find(
        (c) => c.connectionId === conn.id,
      );
      return {
        connection: conn,
        selectedTools: gwConn?.selectedTools ?? null,
      };
    });
  }

  // Build gateway options
  const options: GatewayOptions = {
    connections,
    toolSelectionStrategy: gateway.toolSelectionStrategy,
  };

  return createMCPGateway(options, ctx);
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Virtual Gateway endpoint - uses gateway entity from database
 *
 * Route: POST /mcp/gateway/:gatewayId
 * - If gatewayId is provided: use that specific gateway
 * - If gatewayId is omitted: use default gateway for org (from x-org-id or x-org-slug header)
 */
app.all("/gateway/:gatewayId?", async (c) => {
  const gatewayId = c.req.param("gatewayId");
  const ctx = c.get("meshContext");

  try {
    let gateway: GatewayWithConnections | null = null;

    if (gatewayId) {
      // Load gateway by ID
      gateway = await ctx.storage.gateways.findById(gatewayId);
    } else {
      // Load default gateway for org from headers
      const orgId = c.req.header("x-org-id");
      const orgSlug = c.req.header("x-org-slug");

      if (orgId) {
        gateway = await ctx.storage.gateways.getDefaultByOrgId(orgId);
      } else if (orgSlug) {
        gateway = await ctx.storage.gateways.getDefaultByOrgSlug(orgSlug);
      } else {
        return c.json(
          {
            error:
              "Gateway ID required, or provide x-org-id or x-org-slug header for default gateway",
          },
          400,
        );
      }
    }

    if (!gateway) {
      if (gatewayId) {
        return c.json({ error: `Gateway not found: ${gatewayId}` }, 404);
      }
      return c.json(
        { error: "No default gateway configured for this organization" },
        404,
      );
    }

    if (gateway.status !== "active") {
      return c.json({ error: `Gateway is inactive: ${gateway.id}` }, 503);
    }

    // Set organization context
    const organization = await ctx.db
      .selectFrom("organization")
      .select(["id", "slug", "name"])
      .where("id", "=", gateway.organizationId)
      .executeTakeFirst();

    if (organization) {
      ctx.organization = {
        id: organization.id,
        slug: organization.slug,
        name: organization.name,
      };
    }

    // Create gateway from entity
    const gatewayClient = await createMCPGatewayFromEntity(gateway, ctx);

    // Create MCP server
    const server = new McpServer(
      {
        name: `mcp-gateway-${gateway.title}`,
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

    // Handle list_tools
    server.server.setRequestHandler(
      ListToolsRequestSchema,
      async (_request: ListToolsRequest): Promise<ListToolsResult> => {
        return gatewayClient.client.listTools();
      },
    );

    // Handle call_tool
    server.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: CallToolRequest): Promise<CallToolResult> => {
        return (await gatewayClient.client.callTool(
          request.params,
        )) as CallToolResult;
      },
    );

    // Handle the incoming MCP message
    return await transport.handleMessage(c.req.raw);
  } catch (error) {
    const err = error as Error;
    console.error("[gateway] Error handling gateway request:", err);
    return c.json(
      { error: "Internal server error", message: err.message },
      500,
    );
  }
});

/**
 * Mesh Gateway endpoint (deprecated) - aggregates all organization connections
 *
 * Route: POST /mcp/mesh/:organizationSlug
 * Exposes tools from all active connections in the specified organization
 *
 * @deprecated Use virtual gateways at /mcp/gateway/:gatewayId instead
 */
app.all("/mesh/:organizationSlug", async (c) => {
  const organizationSlug = c.req.param("organizationSlug");
  const ctx = c.get("meshContext");

  try {
    // Query organization by slug
    const organization = await ctx.db
      .selectFrom("organization")
      .select(["id", "slug", "name"])
      .where("slug", "=", organizationSlug)
      .executeTakeFirst();

    if (!organization) {
      return c.json(
        { error: `Organization not found: ${organizationSlug}` },
        404,
      );
    }

    // Set organization context
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
      const server = new McpServer(
        {
          name: "mcp-mesh-aggregated",
          version: "1.0.0",
        },
        {
          capabilities: { tools: {} },
        },
      );

      const transport = new HttpServerTransport({
        enableJsonResponse:
          c.req.header("Accept")?.includes("application/json") ?? false,
      });

      await server.connect(transport);

      server.server.setRequestHandler(
        ListToolsRequestSchema,
        async (): Promise<ListToolsResult> => ({ tools: [] }),
      );

      server.server.setRequestHandler(
        CallToolRequestSchema,
        async (): Promise<CallToolResult> => ({
          content: [{ type: "text", text: "No connections available" }],
          isError: true,
        }),
      );

      return await transport.handleMessage(c.req.raw);
    }

    // Create gateway with all connections (include mode, null strategy = include all)
    const gatewayOptions: GatewayOptions = {
      connections: activeConnections.map((conn) => ({
        connection: conn,
        selectedTools: null, // All tools
      })),
      toolSelectionStrategy: null, // Include mode
    };

    const gatewayClient = await createMCPGateway(gatewayOptions, ctx);

    // Create MCP server
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

    // Handle list_tools
    server.server.setRequestHandler(
      ListToolsRequestSchema,
      async (_request: ListToolsRequest): Promise<ListToolsResult> => {
        return gatewayClient.client.listTools();
      },
    );

    // Handle call_tool
    server.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: CallToolRequest): Promise<CallToolResult> => {
        return (await gatewayClient.client.callTool(
          request.params,
        )) as CallToolResult;
      },
    );

    // Handle the incoming MCP message
    return await transport.handleMessage(c.req.raw);
  } catch (error) {
    const err = error as Error;
    console.error("[mesh] Error handling mesh request:", err);
    return c.json(
      { error: "Internal server error", message: err.message },
      500,
    );
  }
});

export default app;

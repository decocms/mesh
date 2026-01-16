/**
 * MCP Gateway Routes
 *
 * Provides two types of gateway endpoints:
 * 1. Virtual Gateway - Uses gateway entity from database at /mcp/gateway/:gatewayId
 * 2. Mesh Gateway (deprecated) - Aggregates all org connections at /mcp/mesh/:organizationSlug
 *
 * Architecture:
 * - Lists connections for the gateway (from database or organization)
 * - Creates a ProxyCollection for all connections
 * - Uses lazy-loading gateways (ToolGateway, ResourceGateway, etc.) to aggregate resources
 * - Deduplicates tools and prompts by name (first occurrence wins)
 * - Routes resources by URI (globally unique)
 * - Supports exclusion strategy for inverse tool selection
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
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
} from "@modelcontextprotocol/sdk/types.js";
import { Hono } from "hono";
import type { MeshContext } from "../../core/mesh-context";
import {
  PromptGateway,
  ProxyCollection,
  ResourceGateway,
  ResourceTemplateGateway,
  ToolGateway,
  type GatewayClient,
  type GatewayOptions,
} from "../../gateway";
import {
  parseStrategyFromMode,
  type GatewayToolSelectionStrategy,
} from "../../gateway/strategy";
import { getWellKnownDecopilotAgent } from "../../core/well-known-mcp";
import type { GatewayEntity } from "../../tools/gateway/schema";
import type { ConnectionEntity } from "../../tools/connection/schema";
import type { Env } from "../env";

// Define Hono variables type
const app = new Hono<Env>();

// ============================================================================
// MCP Gateway Factory
// ============================================================================

/**
 * Create an MCP gateway that aggregates tools, resources, and prompts from multiple connections
 *
 * Uses lazy-loading gateways - data is only fetched from connections when first accessed.
 *
 * @param options - Gateway configuration (connections with selected tools and strategy)
 * @param ctx - Mesh context for creating proxies
 * @returns GatewayClient interface with aggregated tools, resources, and prompts
 */
async function createMCPGateway(
  options: GatewayOptions,
  ctx: MeshContext,
): Promise<GatewayClient> {
  // Create proxy collection for all connections
  const proxies = await ProxyCollection.create(options.connections, ctx);

  // Create lazy gateway abstractions
  const tools = new ToolGateway(proxies, {
    selectionMode: options.toolSelectionMode,
    strategy: options.toolSelectionStrategy,
  });
  const resources = new ResourceGateway(proxies, {
    selectionMode: options.toolSelectionMode,
  });
  const resourceTemplates = new ResourceTemplateGateway(proxies);
  const prompts = new PromptGateway(proxies, {
    selectionMode: options.toolSelectionMode,
  });

  return {
    client: {
      listTools: tools.list.bind(tools),
      callTool: tools.call.bind(tools),
      listResources: resources.list.bind(resources),
      readResource: resources.read.bind(resources),
      listResourceTemplates: resourceTemplates.list.bind(resourceTemplates),
      listPrompts: prompts.list.bind(prompts),
      getPrompt: prompts.get.bind(prompts),
    },
    callStreamableTool: tools.callStreamable.bind(tools),
  };
}

// ============================================================================
// Helper to create MCP gateway from database entity
// ============================================================================

/**
 * Load gateway entity and create MCP gateway
 * Handles inclusion/exclusion modes and smart_tool_selection strategy
 */
async function createMCPGatewayFromEntity(
  gateway: GatewayEntity,
  ctx: MeshContext,
  strategy: GatewayToolSelectionStrategy,
): Promise<GatewayClient> {
  let connections: Array<{
    connection: ConnectionEntity;
    selectedTools: string[] | null;
    selectedResources: string[] | null;
    selectedPrompts: string[] | null;
  }>;

  if (gateway.tool_selection_mode === "exclusion") {
    // Exclusion mode: list ALL org connections, then apply exclusion filter
    const allConnections = await ctx.storage.connections.list(
      gateway.organization_id,
    );
    const activeConnections = allConnections.filter(
      (c) => c.status === "active",
    );

    // Build a map of connection exclusions
    const exclusionMap = new Map<
      string,
      {
        selectedTools: string[] | null;
        selectedResources: string[] | null;
        selectedPrompts: string[] | null;
      }
    >();
    for (const gwConn of gateway.connections) {
      exclusionMap.set(gwConn.connection_id, {
        selectedTools: gwConn.selected_tools,
        selectedResources: gwConn.selected_resources,
        selectedPrompts: gwConn.selected_prompts,
      });
    }

    connections = [];
    for (const conn of activeConnections) {
      const exclusionEntry = exclusionMap.get(conn.id);

      if (exclusionEntry === undefined) {
        // Connection NOT in gateway.connections -> include all
        connections.push({
          connection: conn,
          selectedTools: null,
          selectedResources: null,
          selectedPrompts: null,
        });
      } else if (
        (exclusionEntry.selectedTools === null ||
          exclusionEntry.selectedTools.length === 0) &&
        (exclusionEntry.selectedResources === null ||
          exclusionEntry.selectedResources.length === 0) &&
        (exclusionEntry.selectedPrompts === null ||
          exclusionEntry.selectedPrompts.length === 0)
      ) {
        // Connection in gateway.connections with all null/empty -> exclude entire connection
        // Skip this connection
      } else {
        // Connection in gateway.connections with specific exclusions
        connections.push({
          connection: conn,
          selectedTools: exclusionEntry.selectedTools,
          selectedResources: exclusionEntry.selectedResources,
          selectedPrompts: exclusionEntry.selectedPrompts,
        });
      }
    }
  } else {
    // Inclusion mode (default): use only the connections specified in gateway
    const connectionIds = gateway.connections.map((c) => c.connection_id);
    const loadedConnections: ConnectionEntity[] = [];

    for (const connId of connectionIds) {
      const conn = await ctx.storage.connections.findById(connId);
      if (conn && conn.status === "active") {
        loadedConnections.push(conn);
      }
    }

    connections = loadedConnections.map((conn) => {
      const gwConn = gateway.connections.find(
        (c) => c.connection_id === conn.id,
      );
      return {
        connection: conn,
        selectedTools: gwConn?.selected_tools ?? null,
        selectedResources: gwConn?.selected_resources ?? null,
        selectedPrompts: gwConn?.selected_prompts ?? null,
      };
    });
  }

  // Build gateway options with strategy
  const options: GatewayOptions = {
    connections,
    toolSelectionMode: gateway.tool_selection_mode,
    toolSelectionStrategy: strategy,
  };

  return createMCPGateway(options, ctx);
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Virtual Gateway endpoint - uses gateway entity from database
 *
 * Route: POST /mcp/gateway/:gatewayId?
 * - If gatewayId is provided: use that specific gateway
 * - If gatewayId is omitted: use Decopilot agent (default agent)
 */
app.all("/gateway/:gatewayId?", async (c) => {
  const gatewayId = c.req.param("gatewayId");
  const ctx = c.get("meshContext");

  try {
    const orgId = c.req.header("x-org-id");
    const orgSlug = c.req.header("x-org-slug");

    const organizationId = orgId
      ? orgId
      : orgSlug
        ? await ctx.db
            .selectFrom("organization")
            .select("id")
            .where("slug", "=", orgSlug)
            .executeTakeFirst()
            .then((org) => org?.id)
        : null;

    const gateway = gatewayId
      ? await ctx.storage.gateways.findById(gatewayId)
      : organizationId
        ? getWellKnownDecopilotAgent(organizationId)
        : null;

    if (!gateway) {
      return c.json({ error: "Agent not found" }, 404);
    }

    if (organizationId && gateway.organization_id !== organizationId) {
      return c.json({ error: "Agent not found" }, 404);
    }

    ctx.gatewayId = gateway.id;

    if (gateway.status !== "active") {
      return c.json({ error: `Agent is inactive: ${gateway.id}` }, 503);
    }

    // Set organization context
    const organization = await ctx.db
      .selectFrom("organization")
      .select(["id", "slug", "name"])
      .where("id", "=", gateway.organization_id)
      .executeTakeFirst();

    if (organization) {
      ctx.organization = {
        id: organization.id,
        slug: organization.slug,
        name: organization.name,
      };
    }

    // Parse strategy from query string mode parameter (defaults to passthrough)
    const mode = c.req.query("mode");
    const strategy = parseStrategyFromMode(mode);

    // Create gateway from entity
    const gatewayClient = await createMCPGatewayFromEntity(
      gateway,
      ctx,
      strategy,
    );

    // Create MCP server
    const server = new McpServer(
      {
        name: `mcp-gateway-${gateway.title}`,
        version: "1.0.0",
      },
      {
        capabilities: { tools: {}, resources: {}, prompts: {} },
      },
    );

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

    // Handle list_resources
    server.server.setRequestHandler(
      ListResourcesRequestSchema,
      async (): Promise<ListResourcesResult> => {
        return gatewayClient.client.listResources();
      },
    );

    // Handle read_resource
    server.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request: ReadResourceRequest): Promise<ReadResourceResult> => {
        return gatewayClient.client.readResource(request.params);
      },
    );

    // Handle list_resource_templates
    server.server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      async (): Promise<ListResourceTemplatesResult> => {
        return gatewayClient.client.listResourceTemplates();
      },
    );

    // Handle list_prompts
    server.server.setRequestHandler(
      ListPromptsRequestSchema,
      async (): Promise<ListPromptsResult> => {
        return gatewayClient.client.listPrompts();
      },
    );

    // Handle get_prompt
    server.server.setRequestHandler(
      GetPromptRequestSchema,
      async (request: GetPromptRequest): Promise<GetPromptResult> => {
        return gatewayClient.client.getPrompt(request.params);
      },
    );

    // Create transport
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse:
        c.req.header("Accept")?.includes("application/json") ?? false,
    });
    // Connect server to transport
    await server.connect(transport);
    // Handle the incoming MCP message
    return await transport
      .handleRequest(c.req.raw)
      .finally(() => transport.close());
  } catch (error) {
    const err = error as Error;
    console.error("[gateway] Error handling gateway request:", err);
    return c.json(
      { error: "Internal server error", message: err.message },
      500,
    );
  }
});

export default app;

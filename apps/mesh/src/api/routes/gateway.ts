/**
 * MCP Gateway Routes
 *
 * Provides two types of gateway endpoints:
 * 1. Virtual MCP - Uses virtual MCP entity from database at /mcp/gateway/:virtualMcpId
 * 2. Virtual MCP alias - Same as above at /mcp/virtual-mcp/:virtualMcpId
 *
 * Architecture:
 * - Lists connections for the virtual MCP (from database or organization)
 * - Creates a ProxyCollection for all connections
 * - Uses lazy-loading aggregators (ToolAggregator, ResourceAggregator, etc.) to aggregate resources
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
  PromptAggregator,
  ProxyCollection,
  ResourceAggregator,
  ResourceTemplateAggregator,
  ToolAggregator,
  type AggregatorClient,
  type AggregatorOptions,
} from "../../aggregator";
import {
  parseStrategyFromMode,
  type AggregatorToolSelectionStrategy,
} from "../../aggregator/strategy";
import { getWellKnownDecopilotAgent } from "../../core/well-known-mcp";
import type { VirtualMCPEntity } from "../../tools/virtual-mcp/schema";
import type { ConnectionEntity } from "../../tools/connection/schema";
import type { Env } from "../env";

// Define Hono variables type
const app = new Hono<Env>();

// ============================================================================
// MCP Aggregator Factory
// ============================================================================

/**
 * Create an MCP aggregator that aggregates tools, resources, and prompts from multiple connections
 *
 * Uses lazy-loading aggregators - data is only fetched from connections when first accessed.
 *
 * @param options - Aggregator configuration (connections with selected tools and strategy)
 * @param ctx - Mesh context for creating proxies
 * @returns AggregatorClient interface with aggregated tools, resources, and prompts
 */
async function createMCPAggregator(
  options: AggregatorOptions,
  ctx: MeshContext,
): Promise<AggregatorClient> {
  // Create proxy collection for all connections
  const proxies = await ProxyCollection.create(options.connections, ctx);

  // Create lazy aggregator abstractions
  const tools = new ToolAggregator(proxies, {
    selectionMode: options.toolSelectionMode,
    strategy: options.toolSelectionStrategy,
  });
  const resources = new ResourceAggregator(proxies, {
    selectionMode: options.toolSelectionMode,
  });
  const resourceTemplates = new ResourceTemplateAggregator(proxies);
  const prompts = new PromptAggregator(proxies, {
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
// Helper to create MCP aggregator from database entity
// ============================================================================

/**
 * Load virtual MCP entity and create MCP aggregator
 * Handles inclusion/exclusion modes and smart_tool_selection strategy
 */
async function createMCPAggregatorFromEntity(
  virtualMcp: VirtualMCPEntity,
  ctx: MeshContext,
  strategy: AggregatorToolSelectionStrategy,
): Promise<AggregatorClient> {
  let connections: Array<{
    connection: ConnectionEntity;
    selectedTools: string[] | null;
    selectedResources: string[] | null;
    selectedPrompts: string[] | null;
  }>;

  if (virtualMcp.tool_selection_mode === "exclusion") {
    // Exclusion mode: list ALL org connections, then apply exclusion filter
    const allConnections = await ctx.storage.connections.list(
      virtualMcp.organization_id,
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
    for (const vmConn of virtualMcp.connections) {
      exclusionMap.set(vmConn.connection_id, {
        selectedTools: vmConn.selected_tools,
        selectedResources: vmConn.selected_resources,
        selectedPrompts: vmConn.selected_prompts,
      });
    }

    connections = [];
    for (const conn of activeConnections) {
      const exclusionEntry = exclusionMap.get(conn.id);

      if (exclusionEntry === undefined) {
        // Connection NOT in virtualMcp.connections -> include all
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
        // Connection in virtualMcp.connections with all null/empty -> exclude entire connection
        // Skip this connection
      } else {
        // Connection in virtualMcp.connections with specific exclusions
        connections.push({
          connection: conn,
          selectedTools: exclusionEntry.selectedTools,
          selectedResources: exclusionEntry.selectedResources,
          selectedPrompts: exclusionEntry.selectedPrompts,
        });
      }
    }
  } else {
    // Inclusion mode (default): use only the connections specified in virtual MCP
    const connectionIds = virtualMcp.connections.map((c) => c.connection_id);
    const loadedConnections: ConnectionEntity[] = [];

    for (const connId of connectionIds) {
      const conn = await ctx.storage.connections.findById(connId);
      if (conn && conn.status === "active") {
        loadedConnections.push(conn);
      }
    }

    connections = loadedConnections.map((conn) => {
      const vmConn = virtualMcp.connections.find(
        (c) => c.connection_id === conn.id,
      );
      return {
        connection: conn,
        selectedTools: vmConn?.selected_tools ?? null,
        selectedResources: vmConn?.selected_resources ?? null,
        selectedPrompts: vmConn?.selected_prompts ?? null,
      };
    });
  }

  // Build aggregator options with strategy
  const options: AggregatorOptions = {
    connections,
    toolSelectionMode: virtualMcp.tool_selection_mode,
    toolSelectionStrategy: strategy,
  };

  return createMCPAggregator(options, ctx);
}

// ============================================================================
// Route Handler (shared between /gateway and /virtual-mcp endpoints)
// ============================================================================

async function handleVirtualMcpRequest(
  c: {
    get: (key: "meshContext") => MeshContext;
    req: {
      header: (name: string) => string | undefined;
      param: (name: string) => string | undefined;
      query: (name: string) => string | undefined;
      raw: Request;
    };
    json: (data: unknown, status?: number) => Response;
  },
  virtualMcpId: string | undefined,
) {
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

    const virtualMcp = virtualMcpId
      ? await ctx.storage.virtualMcps.findById(virtualMcpId)
      : organizationId
        ? getWellKnownDecopilotAgent(organizationId)
        : null;

    if (!virtualMcp) {
      return c.json({ error: "Agent not found" }, 404);
    }

    if (organizationId && virtualMcp.organization_id !== organizationId) {
      return c.json({ error: "Agent not found" }, 404);
    }

    ctx.virtualMcpId = virtualMcp.id;

    if (virtualMcp.status !== "active") {
      return c.json({ error: `Agent is inactive: ${virtualMcp.id}` }, 503);
    }

    // Set organization context
    const organization = await ctx.db
      .selectFrom("organization")
      .select(["id", "slug", "name"])
      .where("id", "=", virtualMcp.organization_id)
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

    // Create aggregator from entity
    const aggregatorClient = await createMCPAggregatorFromEntity(
      virtualMcp,
      ctx,
      strategy,
    );

    // Create MCP server
    const server = new McpServer(
      {
        name: `mcp-virtual-mcp-${virtualMcp.title}`,
        version: "1.0.0",
      },
      {
        capabilities: { tools: {}, resources: {}, prompts: {} },
      },
    );

    // Create transport
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse:
        c.req.header("Accept")?.includes("application/json") ?? false,
    });

    // Connect server to transport
    await server.connect(transport);

    // Handle list_tools
    server.server.setRequestHandler(
      ListToolsRequestSchema,
      async (_request: ListToolsRequest): Promise<ListToolsResult> => {
        return aggregatorClient.client.listTools();
      },
    );

    // Handle call_tool
    server.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: CallToolRequest): Promise<CallToolResult> => {
        return (await aggregatorClient.client.callTool(
          request.params,
        )) as CallToolResult;
      },
    );

    // Handle list_resources
    server.server.setRequestHandler(
      ListResourcesRequestSchema,
      async (): Promise<ListResourcesResult> => {
        return aggregatorClient.client.listResources();
      },
    );

    // Handle read_resource
    server.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request: ReadResourceRequest): Promise<ReadResourceResult> => {
        return aggregatorClient.client.readResource(request.params);
      },
    );

    // Handle list_resource_templates
    server.server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      async (): Promise<ListResourceTemplatesResult> => {
        return aggregatorClient.client.listResourceTemplates();
      },
    );

    // Handle list_prompts - delegate to aggregator
    server.server.setRequestHandler(
      ListPromptsRequestSchema,
      async (): Promise<ListPromptsResult> => {
        return aggregatorClient.client.listPrompts();
      },
    );

    // Handle get_prompt - delegate to aggregator
    server.server.setRequestHandler(
      GetPromptRequestSchema,
      async (request: GetPromptRequest): Promise<GetPromptResult> => {
        return aggregatorClient.client.getPrompt(request.params);
      },
    );

    // Handle the incoming MCP message
    // CRITICAL: Use try/finally to ensure transport is closed
    try {
      return await transport.handleRequest(c.req.raw);
    } finally {
      try {
        await transport.close?.();
      } catch {
        // Ignore close errors
      }
    }
  } catch (error) {
    const err = error as Error;
    console.error("[virtual-mcp] Error handling virtual MCP request:", err);
    return c.json(
      { error: "Internal server error", message: err.message },
      500,
    );
  }
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Virtual MCP endpoint (backward compatible /mcp/gateway/:gatewayId)
 *
 * Route: POST /mcp/gateway/:gatewayId?
 * - If gatewayId is provided: use that specific virtual MCP
 * - If gatewayId is omitted: use Decopilot agent (default agent)
 */
app.all("/gateway/:virtualMcpId?", async (c) => {
  const virtualMcpId = c.req.param("virtualMcpId");
  return handleVirtualMcpRequest(c, virtualMcpId);
});

/**
 * Virtual MCP endpoint (new canonical /mcp/virtual-mcp/:virtualMcpId)
 *
 * Route: POST /mcp/virtual-mcp/:virtualMcpId?
 * - If virtualMcpId is provided: use that specific virtual MCP
 * - If virtualMcpId is omitted: use Decopilot agent (default agent)
 */
app.all("/virtual-mcp/:virtualMcpId?", async (c) => {
  const virtualMcpId = c.req.param("virtualMcpId");
  return handleVirtualMcpRequest(c, virtualMcpId);
});

export default app;

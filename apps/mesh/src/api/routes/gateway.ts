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
 * - Composes them into a single GatewayClient interface
 * - Aggregates tools, resources, resource templates, and prompts from all connections
 * - Deduplicates tools and prompts by name (first occurrence wins)
 * - Routes resources by URI (globally unique)
 * - Supports exclusion strategy for inverse tool selection
 */

import { ServerClient } from "@decocms/bindings/mcp";
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
  type Prompt,
  type ReadResourceRequest,
  type ReadResourceResult,
  type Resource,
  type ResourceTemplate,
} from "@modelcontextprotocol/sdk/types.js";
import { Hono } from "hono";
import type { MeshContext } from "../../core/mesh-context";
import type {
  GatewayToolSelectionStrategy,
  GatewayWithConnections,
  ToolSelectionMode,
} from "../../storage/types";
import type { ConnectionEntity } from "../../tools/connection/schema";
import type { Env } from "../env";
import { HttpServerTransport } from "../http-server-transport";
import { getStrategy, type ToolWithConnection } from "./gateway-strategies";
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

/** Maps resource URI -> connectionId */
interface ResourceMapping {
  connectionId: string;
  uri: string;
}

/** Maps prompt name -> connectionId (first-wins) */
interface PromptMapping {
  connectionId: string;
  name: string;
}

/** Extended gateway client interface with resources and prompts */
interface GatewayClient extends ServerClient {
  client: {
    listTools: () => Promise<ListToolsResult>;
    callTool: (params: CallToolRequest["params"]) => Promise<CallToolResult>;
    listResources: () => Promise<ListResourcesResult>;
    readResource: (
      params: ReadResourceRequest["params"],
    ) => Promise<ReadResourceResult>;
    listResourceTemplates: () => Promise<ListResourceTemplatesResult>;
    listPrompts: () => Promise<ListPromptsResult>;
    getPrompt: (params: GetPromptRequest["params"]) => Promise<GetPromptResult>;
  };
  callStreamableTool: (
    tool: string,
    args: Record<string, unknown>,
  ) => Promise<Response>;
}

/** Gateway configuration for createMCPGateway */
interface GatewayOptions {
  connections: Array<{
    connection: ConnectionEntity;
    selectedTools: string[] | null; // null = all tools (or full exclusion if mode is "exclusion")
  }>;
  toolSelectionMode: ToolSelectionMode;
  toolSelectionStrategy: GatewayToolSelectionStrategy;
}

// ============================================================================
// MCP Gateway Factory
// ============================================================================

/**
 * Create an MCP gateway that aggregates tools, resources, and prompts from multiple connections
 *
 * @param options - Gateway configuration (connections with selected tools and strategy)
 * @param ctx - Mesh context for creating proxies
 * @returns GatewayClient interface with aggregated tools, resources, and prompts
 */
async function createMCPGateway(
  options: GatewayOptions,
  ctx: MeshContext,
): Promise<GatewayClient> {
  // Create proxies for all connections in parallel
  const proxyResults = await Promise.allSettled(
    options.connections.map(async ({ connection, selectedTools }) => {
      try {
        const proxy = await ctx.createMCPProxy(connection);
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

  // Fetch and aggregate all tools from connections
  const toolResults = await Promise.allSettled(
    Array.from(proxies.entries()).map(
      async ([connectionId, { proxy, connection, selectedTools }]) => {
        try {
          const result = await proxy.client.listTools();
          let tools = result.tools;

          // Apply selection based on mode
          if (options.toolSelectionMode === "exclusion") {
            if (selectedTools && selectedTools.length > 0) {
              const excludeSet = new Set(selectedTools);
              tools = tools.filter((t) => !excludeSet.has(t.name));
            }
          } else {
            if (selectedTools && selectedTools.length > 0) {
              const selectedSet = new Set(selectedTools);
              tools = tools.filter((t) => selectedSet.has(t.name));
            }
          }

          return { connectionId, connectionTitle: connection.title, tools };
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

  // Deduplicate and build tools with connection metadata
  const seenNames = new Set<string>();
  const allTools: ToolWithConnection[] = [];
  const toolMappings = new Map<string, ToolMapping>();
  const categories = new Set<string>();

  for (const result of toolResults) {
    if (result.status !== "fulfilled" || !result.value) continue;

    const { connectionId, connectionTitle, tools } = result.value;
    categories.add(connectionTitle);

    for (const tool of tools) {
      if (seenNames.has(tool.name)) continue;
      seenNames.add(tool.name);

      allTools.push({
        ...tool,
        connectionId,
        connectionTitle,
      });
      toolMappings.set(tool.name, { connectionId, originalName: tool.name });
    }
  }

  // ============================================================================
  // Aggregate Resources from all connections
  // ============================================================================
  const resourceResults = await Promise.allSettled(
    Array.from(proxies.entries()).map(async ([connectionId, { proxy }]) => {
      try {
        const result = await proxy.client.listResources();
        return { connectionId, resources: result.resources };
      } catch (error) {
        console.error(
          `[gateway] Failed to list resources for connection ${connectionId}:`,
          error,
        );
        return { connectionId, resources: [] as Resource[] };
      }
    }),
  );

  // Build resource URI -> connection mapping (URIs are globally unique)
  const allResources: Resource[] = [];
  const resourceMappings = new Map<string, ResourceMapping>();

  for (const result of resourceResults) {
    if (result.status !== "fulfilled") continue;

    const { connectionId, resources } = result.value;
    for (const resource of resources) {
      allResources.push(resource);
      resourceMappings.set(resource.uri, { connectionId, uri: resource.uri });
    }
  }

  // ============================================================================
  // Aggregate Resource Templates from all connections
  // ============================================================================
  const resourceTemplateResults = await Promise.allSettled(
    Array.from(proxies.entries()).map(async ([connectionId, { proxy }]) => {
      try {
        const result = await proxy.client.listResourceTemplates();
        return { connectionId, templates: result.resourceTemplates };
      } catch (error) {
        console.error(
          `[gateway] Failed to list resource templates for connection ${connectionId}:`,
          error,
        );
        return { connectionId, templates: [] as ResourceTemplate[] };
      }
    }),
  );

  // Build resource template uriTemplate -> connection mapping
  const allResourceTemplates: ResourceTemplate[] = [];
  const resourceTemplateMappings = new Map<string, ResourceMapping>();

  for (const result of resourceTemplateResults) {
    if (result.status !== "fulfilled") continue;

    const { connectionId, templates } = result.value;
    for (const template of templates) {
      allResourceTemplates.push(template);
      resourceTemplateMappings.set(template.uriTemplate, {
        connectionId,
        uri: template.uriTemplate,
      });
    }
  }

  // ============================================================================
  // Aggregate Prompts from all connections (first-wins deduplication)
  // ============================================================================
  const promptResults = await Promise.allSettled(
    Array.from(proxies.entries()).map(async ([connectionId, { proxy }]) => {
      try {
        const result = await proxy.client.listPrompts();
        return { connectionId, prompts: result.prompts };
      } catch (error) {
        console.error(
          `[gateway] Failed to list prompts for connection ${connectionId}:`,
          error,
        );
        return { connectionId, prompts: [] as Prompt[] };
      }
    }),
  );

  // Build prompt name -> connection mapping (first-wins, like tools)
  const seenPromptNames = new Set<string>();
  const allPrompts: Prompt[] = [];
  const promptMappings = new Map<string, PromptMapping>();

  for (const result of promptResults) {
    if (result.status !== "fulfilled") continue;

    const { connectionId, prompts } = result.value;
    for (const prompt of prompts) {
      if (seenPromptNames.has(prompt.name)) continue;
      seenPromptNames.add(prompt.name);

      allPrompts.push(prompt);
      promptMappings.set(prompt.name, { connectionId, name: prompt.name });
    }
  }

  // Base callTool that routes to the correct connection
  const baseCallTool = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> => {
    const mapping = toolMappings.get(name);
    if (!mapping) {
      return {
        content: [{ type: "text", text: `Tool not found: ${name}` }],
        isError: true,
      };
    }

    const proxyEntry = proxies.get(mapping.connectionId);
    if (!proxyEntry) {
      return {
        content: [
          { type: "text", text: `Connection not found for tool: ${name}` },
        ],
        isError: true,
      };
    }

    const result = await proxyEntry.proxy.client.callTool({
      name: mapping.originalName,
      arguments: args,
    });

    return result as CallToolResult;
  };

  // Apply the strategy to transform tools
  const strategy = getStrategy(options.toolSelectionStrategy);
  const strategyResult = strategy({
    tools: allTools,
    callTool: baseCallTool,
    categories: Array.from(categories).sort(),
  });

  // Wrap callTool to accept MCP params format
  const listTools = async (): Promise<ListToolsResult> => ({
    tools: strategyResult.tools,
  });

  const callTool = async (
    params: CallToolRequest["params"],
  ): Promise<CallToolResult> => {
    return strategyResult.callTool(
      params.name,
      params.arguments ?? {},
    ) as Promise<CallToolResult>;
  };

  // Streamable calls go through strategy callTool then to base if needed
  const callStreamableTool = async (
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<Response> => {
    // For smart strategy, GATEWAY_CALL_TOOL handles delegation
    // For passthrough, route directly to underlying proxy
    const mapping = toolMappings.get(toolName);
    if (mapping) {
      // Direct tool - route to proxy
      const proxyEntry = proxies.get(mapping.connectionId);
      if (proxyEntry) {
        return proxyEntry.proxy.callStreamableTool(mapping.originalName, args);
      }
    }

    // Meta-tool or not found - execute through strategy and return JSON
    const result = await strategyResult.callTool(toolName, args);
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  };

  // ============================================================================
  // Resource handlers
  // ============================================================================
  const listResources = async (): Promise<ListResourcesResult> => ({
    resources: allResources,
  });

  const readResource = async (
    params: ReadResourceRequest["params"],
  ): Promise<ReadResourceResult> => {
    const mapping = resourceMappings.get(params.uri);
    if (!mapping) {
      throw new Error(`Resource not found: ${params.uri}`);
    }

    const proxyEntry = proxies.get(mapping.connectionId);
    if (!proxyEntry) {
      throw new Error(`Connection not found for resource: ${params.uri}`);
    }

    return await proxyEntry.proxy.client.readResource(params);
  };

  const listResourceTemplates =
    async (): Promise<ListResourceTemplatesResult> => ({
      resourceTemplates: allResourceTemplates,
    });

  // ============================================================================
  // Prompt handlers
  // ============================================================================
  const listPrompts = async (): Promise<ListPromptsResult> => ({
    prompts: allPrompts,
  });

  const getPrompt = async (
    params: GetPromptRequest["params"],
  ): Promise<GetPromptResult> => {
    const mapping = promptMappings.get(params.name);
    if (!mapping) {
      throw new Error(`Prompt not found: ${params.name}`);
    }

    const proxyEntry = proxies.get(mapping.connectionId);
    if (!proxyEntry) {
      throw new Error(`Connection not found for prompt: ${params.name}`);
    }

    return await proxyEntry.proxy.client.getPrompt(params);
  };

  return {
    client: {
      listTools,
      callTool,
      listResources,
      readResource,
      listResourceTemplates,
      listPrompts,
      getPrompt,
    },
    callStreamableTool,
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
  gateway: GatewayWithConnections,
  ctx: MeshContext,
): Promise<GatewayClient> {
  let connections: Array<{
    connection: ConnectionEntity;
    selectedTools: string[] | null;
  }>;

  if (gateway.toolSelectionMode === "exclusion") {
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
    // Inclusion mode (default): use only the connections specified in gateway
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

  // Build gateway options with strategy
  const options: GatewayOptions = {
    connections,
    toolSelectionMode: gateway.toolSelectionMode,
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

    ctx.gatewayId = gateway.id;

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
        capabilities: { tools: {}, resources: {}, prompts: {} },
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

    // Handle the incoming MCP message
    return await transport.handleMessage(c.req.raw).then(async (res) => {
      return res;
    });
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

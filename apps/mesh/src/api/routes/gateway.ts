/**
 * Virtual MCP / Agent Routes
 *
 * Provides endpoints for accessing Virtual MCPs (agents):
 * 1. /mcp/gateway/:virtualMcpId - Backward compatible endpoint
 * 2. /mcp/virtual-mcp/:virtualMcpId - New canonical endpoint
 *
 * Architecture:
 * - Lists connections for the Virtual MCP (from database or organization)
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
  createMCPAggregatorFromEntity,
  parseStrategyFromMode,
} from "../../mcp-clients/virtual-mcp";
import { parseVirtualUrl } from "../../tools/connection/schema";
import { getWellKnownDecopilotAgent } from "@decocms/mesh-sdk";
import type { Env } from "../env";

// Define Hono variables type
const app = new Hono<Env>();

// ============================================================================
// Route Handler (shared between /gateway and /virtual-mcp endpoints for backward compat)
// ============================================================================

export async function handleVirtualMcpRequest(
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
    // Prefer x-org-id header (no DB lookup) over x-org-slug (requires DB lookup)
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

    if (virtualMcp.status !== "active") {
      return c.json({ error: `Agent is inactive: ${virtualMcp.id}` }, 503);
    }

    // Set connection context (Virtual MCPs are now connections)
    ctx.connectionId = virtualMcp.id;

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

    // Handle Decopilot agent (well-known agent that aggregates all org connections)
    // For Decopilot, we need to gather all active connections and populate the connections array
    let processedVirtualMcp = virtualMcp;
    if (virtualMcp.id.startsWith("decopilot-")) {
      // Fetch all active connections for the organization
      const allConnections = await ctx.storage.connections.list(
        virtualMcp.organization_id,
      );
      // Filter out inactive connections and self-referencing VIRTUAL connections
      const activeConnections = allConnections.filter((c) => {
        if (c.status !== "active") return false;
        // Skip VIRTUAL connections that reference this virtual MCP (self-reference)
        if (c.connection_type === "VIRTUAL") {
          const referencedVirtualMcpId = parseVirtualUrl(c.connection_url);
          if (referencedVirtualMcpId === virtualMcp.id) return false;
        }
        return true;
      });

      // Build connections array with all tools/resources/prompts (null = include all)
      processedVirtualMcp = {
        ...virtualMcp,
        connections: activeConnections.map((c) => ({
          connection_id: c.id,
          selected_tools: null, // null = all tools
          selected_resources: null, // null = all resources
          selected_prompts: null, // null = all prompts
        })),
      };
    }

    // Create client from entity
    await using client = await createMCPAggregatorFromEntity(
      processedVirtualMcp,
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
        instructions: virtualMcp.metadata?.instructions ?? undefined,
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
        return client.listTools();
      },
    );

    // Handle call_tool
    server.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: CallToolRequest): Promise<CallToolResult> => {
        return (await client.callTool(request.params)) as CallToolResult;
      },
    );

    // Handle list_resources
    server.server.setRequestHandler(
      ListResourcesRequestSchema,
      async (): Promise<ListResourcesResult> => {
        return client.listResources();
      },
    );

    // Handle read_resource
    server.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request: ReadResourceRequest): Promise<ReadResourceResult> => {
        return client.readResource(request.params);
      },
    );

    // Handle list_resource_templates
    server.server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      async (): Promise<ListResourceTemplatesResult> => {
        return client.listResourceTemplates();
      },
    );

    // Handle list_prompts
    server.server.setRequestHandler(
      ListPromptsRequestSchema,
      async (): Promise<ListPromptsResult> => {
        return client.listPrompts();
      },
    );

    // Handle get_prompt
    server.server.setRequestHandler(
      GetPromptRequestSchema,
      async (request: GetPromptRequest): Promise<GetPromptResult> => {
        return client.getPrompt(request.params);
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
      // Client will be automatically disposed via await using
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
 * Virtual MCP endpoint (backward compatible /mcp/gateway/:virtualMcpId)
 *
 * Route: POST /mcp/gateway/:virtualMcpId?
 * - If virtualMcpId is provided: use that specific Virtual MCP
 * - If virtualMcpId is omitted: use Decopilot agent (default agent)
 */
app.all("/gateway/:virtualMcpId?", async (c) => {
  const virtualMcpId =
    c.req.param("virtualMcpId") || c.req.header("x-virtual-mcp-id");
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
  const virtualMcpId =
    c.req.param("virtualMcpId") || c.req.header("x-virtual-mcp-id");
  return handleVirtualMcpRequest(c, virtualMcpId);
});

export default app;

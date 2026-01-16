/**
 * MCP Gateway Routes
 *
 * @deprecated Virtual MCPs are now served through /mcp/:connectionId.
 * This route is kept for backward compatibility.
 *
 * Route: /mcp/gateway/:gatewayId?
 * - If gatewayId is provided: use that specific virtual MCP
 * - If gatewayId is omitted: use Decopilot agent (default agent)
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
import { getWellKnownDecopilotAgent } from "../../core/well-known-mcp";
import { createVirtualMCPFromEntity } from "../../virtual-mcp";
import { parseStrategyFromMode } from "../../gateway/strategy";
import type { Env } from "../env";

const app = new Hono<Env>();

/**
 * Virtual Gateway endpoint - uses virtual MCP entity from database
 *
 * @deprecated Use /mcp/:connectionId with a virtual connection type instead.
 *
 * Route: POST /mcp/gateway/:gatewayId?
 * - If gatewayId is provided: use that specific virtual MCP
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

    const virtualMcp = gatewayId
      ? await ctx.storage.virtualMcps.findById(gatewayId)
      : organizationId
        ? getWellKnownDecopilotAgent(organizationId)
        : null;

    if (!virtualMcp) {
      return c.json({ error: "Agent not found" }, 404);
    }

    if (organizationId && virtualMcp.organization_id !== organizationId) {
      return c.json({ error: "Agent not found" }, 404);
    }

    ctx.gatewayId = virtualMcp.id;

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

    // Create virtual MCP client from entity
    const virtualMcpClient = await createVirtualMCPFromEntity(
      virtualMcp,
      ctx,
      strategy,
    );

    // Create MCP server
    const server = new McpServer(
      {
        name: `mcp-gateway-${virtualMcp.title}`,
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
        return virtualMcpClient.client.listTools();
      },
    );

    // Handle call_tool
    server.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: CallToolRequest): Promise<CallToolResult> => {
        return (await virtualMcpClient.client.callTool(
          request.params,
        )) as CallToolResult;
      },
    );

    // Handle list_resources
    server.server.setRequestHandler(
      ListResourcesRequestSchema,
      async (): Promise<ListResourcesResult> => {
        return virtualMcpClient.client.listResources();
      },
    );

    // Handle read_resource
    server.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request: ReadResourceRequest): Promise<ReadResourceResult> => {
        return virtualMcpClient.client.readResource(request.params);
      },
    );

    // Handle list_resource_templates
    server.server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      async (): Promise<ListResourceTemplatesResult> => {
        return virtualMcpClient.client.listResourceTemplates();
      },
    );

    // Handle list_prompts
    server.server.setRequestHandler(
      ListPromptsRequestSchema,
      async (): Promise<ListPromptsResult> => {
        return virtualMcpClient.client.listPrompts();
      },
    );

    // Handle get_prompt
    server.server.setRequestHandler(
      GetPromptRequestSchema,
      async (request: GetPromptRequest): Promise<GetPromptResult> => {
        return virtualMcpClient.client.getPrompt(request.params);
      },
    );

    // Handle the incoming MCP message
    return await transport.handleRequest(c.req.raw);
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

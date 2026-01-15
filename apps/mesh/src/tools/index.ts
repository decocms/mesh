/**
 * Tool Registry
 *
 * Central export for all MCP Mesh management tools
 * Types are inferred from ALL_TOOLS - this is the source of truth.
 */

import { MeshContext } from "@/core/mesh-context";
import { WellKnownMCPId } from "@/core/well-known-mcp";
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
  type ListToolsResult,
  type ReadResourceRequest,
  type ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as ApiKeyTools from "./apiKeys";
import * as CodeExecutionTools from "./code-execution";
import * as ConnectionTools from "./connection";
import * as DatabaseTools from "./database";
import * as EventBusTools from "./eventbus";
import * as GatewayTools from "./gateway";
import * as MonitoringTools from "./monitoring";
import * as OrganizationTools from "./organization";
import * as PromptTools from "./prompt";
import * as ResourceTools from "./resource";
import * as ToolCollectionTools from "./tool";
import * as UserTools from "./user";
import { ToolName } from "./registry";
import { getToolsWithConnections } from "./code-execution/utils";
import type { ToolEntity } from "./tool/schema";

// All available tools - types are inferred
export const ALL_TOOLS = [
  OrganizationTools.ORGANIZATION_CREATE,
  OrganizationTools.ORGANIZATION_LIST,
  OrganizationTools.ORGANIZATION_GET,
  OrganizationTools.ORGANIZATION_UPDATE,
  OrganizationTools.ORGANIZATION_DELETE,
  OrganizationTools.ORGANIZATION_SETTINGS_GET,
  OrganizationTools.ORGANIZATION_SETTINGS_UPDATE,
  OrganizationTools.ORGANIZATION_MEMBER_ADD,
  OrganizationTools.ORGANIZATION_MEMBER_REMOVE,
  OrganizationTools.ORGANIZATION_MEMBER_LIST,
  OrganizationTools.ORGANIZATION_MEMBER_UPDATE_ROLE,

  // Connection collection tools
  ConnectionTools.COLLECTION_CONNECTIONS_CREATE,
  ConnectionTools.COLLECTION_CONNECTIONS_LIST,
  ConnectionTools.COLLECTION_CONNECTIONS_GET,
  ConnectionTools.COLLECTION_CONNECTIONS_UPDATE,
  ConnectionTools.COLLECTION_CONNECTIONS_DELETE,
  ConnectionTools.CONNECTION_TEST,

  // Gateway collection tools
  GatewayTools.COLLECTION_GATEWAY_CREATE,
  GatewayTools.COLLECTION_GATEWAY_LIST,
  GatewayTools.COLLECTION_GATEWAY_GET,
  GatewayTools.COLLECTION_GATEWAY_UPDATE,
  GatewayTools.COLLECTION_GATEWAY_DELETE,

  // Tool/Resource/Prompt collection tools
  ToolCollectionTools.COLLECTION_TOOLS_CREATE,
  ToolCollectionTools.COLLECTION_TOOLS_LIST,
  ToolCollectionTools.COLLECTION_TOOLS_GET,
  ToolCollectionTools.COLLECTION_TOOLS_UPDATE,
  ToolCollectionTools.COLLECTION_TOOLS_DELETE,
  ResourceTools.COLLECTION_RESOURCES_CREATE,
  ResourceTools.COLLECTION_RESOURCES_LIST,
  ResourceTools.COLLECTION_RESOURCES_GET,
  ResourceTools.COLLECTION_RESOURCES_UPDATE,
  ResourceTools.COLLECTION_RESOURCES_DELETE,
  PromptTools.COLLECTION_PROMPTS_CREATE,
  PromptTools.COLLECTION_PROMPTS_LIST,
  PromptTools.COLLECTION_PROMPTS_GET,
  PromptTools.COLLECTION_PROMPTS_UPDATE,
  PromptTools.COLLECTION_PROMPTS_DELETE,

  // Database tools
  DatabaseTools.DATABASES_RUN_SQL,

  // Monitoring tools
  MonitoringTools.MONITORING_LOGS_LIST,
  MonitoringTools.MONITORING_STATS,
  // API Key tools
  ApiKeyTools.API_KEY_CREATE,
  ApiKeyTools.API_KEY_LIST,
  ApiKeyTools.API_KEY_UPDATE,
  ApiKeyTools.API_KEY_DELETE,

  // Event Bus tools
  EventBusTools.EVENT_PUBLISH,
  EventBusTools.EVENT_SUBSCRIBE,
  EventBusTools.EVENT_UNSUBSCRIBE,
  EventBusTools.EVENT_CANCEL,
  EventBusTools.EVENT_ACK,
  EventBusTools.EVENT_SUBSCRIPTION_LIST,
  EventBusTools.EVENT_SYNC_SUBSCRIPTIONS,

  // User tools
  UserTools.USER_GET,

  // Code Execution tools
  CodeExecutionTools.CODE_EXECUTION_SEARCH_TOOLS,
  CodeExecutionTools.CODE_EXECUTION_DESCRIBE_TOOLS,
  CodeExecutionTools.CODE_EXECUTION_RUN_CODE,
] as const satisfies { name: ToolName }[];

export type MCPMeshTools = typeof ALL_TOOLS;

// Derive tool name type from ALL_TOOLS
export type ToolNameFromTools = (typeof ALL_TOOLS)[number]["name"];

export const managementMCP = (ctx: MeshContext) => {
  const getManagementTools = () => ALL_TOOLS;

  const listStoredTools = async (): Promise<ToolEntity[]> => {
    if (!ctx.organization) return [];
    return ctx.storage.tools.list(ctx.organization.id);
  };

  const listTools = async (): Promise<ListToolsResult> => {
    const managementTools = getManagementTools();
    const storedTools = await listStoredTools();

    const seen = new Set<string>();
    const tools = [];

    for (const tool of managementTools) {
      if (seen.has(tool.name)) continue;
      seen.add(tool.name);
      tools.push({
        name: tool.name,
        description: tool.description ?? "",
        inputSchema: z.toJSONSchema(tool.inputSchema),
        outputSchema: tool.outputSchema
          ? z.toJSONSchema(tool.outputSchema)
          : undefined,
      });
    }

    for (const tool of storedTools) {
      if (seen.has(tool.name)) continue;
      seen.add(tool.name);
      tools.push({
        name: tool.name,
        description: tool.description ?? "",
        inputSchema: tool.input_schema,
        outputSchema: tool.output_schema ?? undefined,
      });
    }

    return {
      tools,
    } as ListToolsResult;
  };

  const executeManagementTool = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> => {
    const tool = ALL_TOOLS.find((t) => t.name === name);
    if (!tool) {
      return {
        content: [{ type: "text", text: `Tool not found: ${name}` }],
        isError: true,
      };
    }

    ctx.access.setToolName(tool.name);
    const result = await tool.execute(args, ctx);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result as { [x: string]: unknown } | undefined,
    };
  };

  const listResources = async (): Promise<ListResourcesResult> => {
    if (!ctx.organization) return { resources: [] };
    const resources = await ctx.storage.resources.list(ctx.organization.id);
    return {
      resources: resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description ?? undefined,
        mimeType: resource.mime_type ?? undefined,
      })),
    };
  };

  const readResource = async (
    params: ReadResourceRequest["params"],
  ): Promise<ReadResourceResult> => {
    if (!ctx.organization) return { contents: [] };
    const resources = await ctx.storage.resources.list(ctx.organization.id);
    const resource = resources.find((r) => r.uri === params.uri);
    if (!resource) {
      return { contents: [] };
    }

    if (resource.text !== null && resource.text !== undefined) {
      return {
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.mime_type ?? undefined,
            text: resource.text,
          },
        ],
      };
    }

    if (resource.blob !== null && resource.blob !== undefined) {
      return {
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.mime_type ?? undefined,
            blob: resource.blob,
          },
        ],
      };
    }

    return {
      contents: [
        {
          uri: resource.uri,
          mimeType: resource.mime_type ?? undefined,
          text: "",
        },
      ],
    };
  };

  const listResourceTemplates =
    async (): Promise<ListResourceTemplatesResult> => {
      return { resourceTemplates: [] };
    };

  const renderMustache = (template: string, args: Record<string, string>) => {
    return template.replace(/{{\s*([\w.-]+)\s*}}/g, (_match, key) => {
      return args[key] ?? "";
    });
  };

  const listPrompts = async (): Promise<ListPromptsResult> => {
    if (!ctx.organization) return { prompts: [] };
    const prompts = await ctx.storage.prompts.list(ctx.organization.id);
    return {
      prompts: prompts.map((prompt) => ({
        name: prompt.name,
        title: prompt.title,
        description: prompt.description ?? undefined,
        arguments: prompt.arguments ?? undefined,
      })),
    };
  };

  const getPrompt = async (
    params: GetPromptRequest["params"],
  ): Promise<GetPromptResult> => {
    if (!ctx.organization) return { messages: [] };
    const prompts = await ctx.storage.prompts.list(ctx.organization.id);
    const prompt = prompts.find((p) => p.name === params.name);
    if (!prompt) {
      return { messages: [] };
    }

    const args = (params.arguments ?? {}) as Record<string, string>;

    if (prompt.messages && prompt.messages.length > 0) {
      return { messages: prompt.messages };
    }

    if (prompt.template) {
      const rendered = renderMustache(prompt.template, args);
      return {
        messages: [
          {
            role: "user",
            content: { type: "text", text: rendered },
          },
        ],
      };
    }

    return { messages: [] };
  };

  const callTool = async (
    params: CallToolRequest["params"],
  ): Promise<CallToolResult> => {
    ctx.access.setToolName(params.name);
    await ctx.access.check();

    const managementTool = ALL_TOOLS.find((t) => t.name === params.name);
    if (managementTool) {
      return await executeManagementTool(params.name, params.arguments ?? {});
    }

    const toolContext = await getToolsWithConnections(ctx, {
      excludeConnectionIds: [WellKnownMCPId.SELF],
    });
    const result = await toolContext.callTool(
      params.name,
      params.arguments ?? {},
    );

    return result;
  };

  const handleMcpRequest = async (req: Request): Promise<Response> => {
    const server = new McpServer(
      { name: "mcp-mesh-management", version: "1.0.0" },
      { capabilities: { tools: {}, resources: {}, prompts: {} } },
    );

    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse:
        req.headers.get("Accept")?.includes("application/json") ?? false,
    });

    await server.connect(transport);

    server.server.setRequestHandler(ListToolsRequestSchema, () => listTools());
    server.server.setRequestHandler(CallToolRequestSchema, (request) =>
      callTool(request.params),
    );
    server.server.setRequestHandler(ListResourcesRequestSchema, () =>
      listResources(),
    );
    server.server.setRequestHandler(ReadResourceRequestSchema, (request) =>
      readResource(request.params),
    );
    server.server.setRequestHandler(ListResourceTemplatesRequestSchema, () =>
      listResourceTemplates(),
    );
    server.server.setRequestHandler(ListPromptsRequestSchema, () =>
      listPrompts(),
    );
    server.server.setRequestHandler(GetPromptRequestSchema, (request) =>
      getPrompt(request.params),
    );

    return await transport.handleRequest(req);
  };

  return {
    fetch: handleMcpRequest,
    client: {
      listTools,
      callTool: (args: CallToolRequest["params"]) => callTool(args),
      listResources,
      readResource: (params: ReadResourceRequest["params"]) =>
        readResource(params),
      listResourceTemplates,
      listPrompts,
      getPrompt: (params: GetPromptRequest["params"]) => getPrompt(params),
    },
  };
};

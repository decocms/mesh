/**
 * Tool Registry
 *
 * Central export for all MCP Mesh management tools
 * Types are inferred from ALL_TOOLS - this is the source of truth.
 */

import { mcpServer } from "@/api/utils/mcp";
import { MeshContext } from "@/core/mesh-context";
import * as ApiKeyTools from "./apiKeys";
import * as CodeExecutionTools from "./code-execution";
import * as ConnectionTools from "./connection";
import * as DatabaseTools from "./database";
import * as EventBusTools from "./eventbus";
import * as GatewayTools from "./gateway";
import * as MonitoringTools from "./monitoring";
import * as OrganizationTools from "./organization";
import * as ThreadTools from "./thread";
import * as UserTools from "./user";
import { ToolName } from "./registry";

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
  // Thread collection tools
  ThreadTools.COLLECTION_THREADS_CREATE,
  ThreadTools.COLLECTION_THREADS_LIST,
  ThreadTools.COLLECTION_THREADS_GET,
  ThreadTools.COLLECTION_THREADS_UPDATE,
  ThreadTools.COLLECTION_THREADS_DELETE,
  ThreadTools.COLLECTION_THREAD_MESSAGES_LIST,
] as const satisfies { name: ToolName }[];

export type MCPMeshTools = typeof ALL_TOOLS;

// Derive tool name type from ALL_TOOLS
export type ToolNameFromTools = (typeof ALL_TOOLS)[number]["name"];

export const managementMCP = (ctx: MeshContext) => {
  // Convert ALL_TOOLS to ToolDefinition format
  const tools = ALL_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: async (args: any) => {
      ctx.access.setToolName(tool.name);
      // Execute the tool with the mesh context
      return await tool.execute(args, ctx);
    },
  }));

  // Create and use MCP server with builder pattern
  const server = mcpServer({
    name: "mcp-mesh-management",
    version: "1.0.0",
  })
    .withTools(tools)
    .build();

  // Handle the incoming MCP message
  return server;
};

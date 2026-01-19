/**
 * Aggregator Types
 *
 * Shared types for aggregator abstractions
 */

import { ServerClient } from "@decocms/bindings/mcp";
import type {
  CallToolRequest,
  CallToolResult,
  GetPromptRequest,
  GetPromptResult,
  ListPromptsResult,
  ListResourcesResult,
  ListResourceTemplatesResult,
  ListToolsResult,
  ReadResourceRequest,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { createMCPProxy } from "../api/routes/proxy";
import type { ToolSelectionMode } from "../storage/types";
import type { ConnectionEntity } from "../tools/connection/schema";
import type { AggregatorToolSelectionStrategy } from "./strategy";

/** Proxy type returned by createMCPProxy */
export type MCPProxy = Awaited<ReturnType<typeof createMCPProxy>>;

/** Entry in the ProxyCollection */
export interface ProxyEntry {
  proxy: MCPProxy;
  connection: ConnectionEntity;
  selectedTools: string[] | null;
  selectedResources: string[] | null;
  selectedPrompts: string[] | null;
}

/** Options for creating an aggregator */
export interface AggregatorOptions {
  connections: Array<{
    connection: ConnectionEntity;
    selectedTools: string[] | null;
    selectedResources: string[] | null;
    selectedPrompts: string[] | null;
  }>;
  toolSelectionMode: ToolSelectionMode;
  toolSelectionStrategy: AggregatorToolSelectionStrategy;
}

/** Extended aggregator client interface with resources and prompts */
export interface AggregatorClient extends ServerClient {
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

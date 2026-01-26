/**
 * Virtual MCP Types
 *
 * Shared types for virtual MCP abstractions
 */

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
import type { ConnectionEntity } from "../../tools/connection/schema";

/**
 * Virtual MCP tool selection strategy
 * - "passthrough": Pass tools through as-is (default)
 * - "smart_tool_selection": Smart tool selection behavior
 * - "code_execution": Code execution behavior
 */
export type VirtualMCPToolSelectionStrategy =
  | "passthrough"
  | "smart_tool_selection"
  | "code_execution";

/**
 * Client-like interface for virtual MCP entry points.
 * Matches the subset of SDK Client methods we need for aggregation.
 */
export interface VirtualMCPClientLike {
  listTools: () => Promise<ListToolsResult>;
  callTool: (params: CallToolRequest["params"]) => Promise<CallToolResult>;
  listResources: () => Promise<ListResourcesResult>;
  readResource: (
    params: ReadResourceRequest["params"],
  ) => Promise<ReadResourceResult>;
  listResourceTemplates: () => Promise<ListResourceTemplatesResult>;
  listPrompts: () => Promise<ListPromptsResult>;
  getPrompt: (params: GetPromptRequest["params"]) => Promise<GetPromptResult>;
}

/** Entry for virtual MCP connections */
export interface VirtualMCPConnectionEntry {
  client: VirtualMCPClientLike;
  connection: ConnectionEntity;
  selectedTools: string[] | null;
  selectedResources: string[] | null;
  selectedPrompts: string[] | null;
  callStreamableTool?: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<Response>;
}

/** Options for creating a virtual MCP */
export interface VirtualMCPOptions {
  connections: Array<{
    connection: ConnectionEntity;
    selectedTools: string[] | null;
    selectedResources: string[] | null;
    selectedPrompts: string[] | null;
  }>;
  toolSelectionStrategy:
    | "passthrough"
    | "smart_tool_selection"
    | "code_execution";
}

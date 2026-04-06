/**
 * IClient — Minimal interface for MCP Client-compatible objects.
 *
 * The MCP SDK `Client` class satisfies this interface structurally,
 * so existing `Client` instances can be used directly. This interface
 * enables duck-typed alternatives (like `GatewayClient`) that don't
 * need to extend the SDK's concrete `Client` class.
 */

import type {
  CallToolRequest,
  CallToolResult,
  CompatibilityCallToolResult,
  GetPromptRequest,
  GetPromptResult,
  ListPromptsRequest,
  ListPromptsResult,
  ListResourcesRequest,
  ListResourcesResult,
  ListResourceTemplatesRequest,
  ListResourceTemplatesResult,
  ListToolsRequest,
  ListToolsResult,
  ReadResourceRequest,
  ReadResourceResult,
  ServerCapabilities,
} from "@modelcontextprotocol/sdk/types.js";
import type { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";

export interface IClient {
  listTools(
    params?: ListToolsRequest["params"],
    options?: RequestOptions,
  ): Promise<ListToolsResult>;

  callTool(
    params: CallToolRequest["params"],
    resultSchema?: unknown,
    options?: RequestOptions,
  ): Promise<CallToolResult | CompatibilityCallToolResult>;

  listResources(
    params?: ListResourcesRequest["params"],
    options?: RequestOptions,
  ): Promise<ListResourcesResult>;

  readResource(
    params: ReadResourceRequest["params"],
    options?: RequestOptions,
  ): Promise<ReadResourceResult>;

  listResourceTemplates(
    params?: ListResourceTemplatesRequest["params"],
    options?: RequestOptions,
  ): Promise<ListResourceTemplatesResult>;

  listPrompts(
    params?: ListPromptsRequest["params"],
    options?: RequestOptions,
  ): Promise<ListPromptsResult>;

  getPrompt(
    params: GetPromptRequest["params"],
    options?: RequestOptions,
  ): Promise<GetPromptResult>;

  getServerCapabilities(): ServerCapabilities | undefined;
  getInstructions(): string | undefined;
  close(): Promise<void>;
}

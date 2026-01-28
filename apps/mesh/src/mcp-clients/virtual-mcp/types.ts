/**
 * Virtual MCP Types
 *
 * Shared types for virtual MCP client abstractions
 */

import type { ConnectionEntity } from "../../tools/connection/schema";
import type { VirtualMCPConnection } from "../../tools/virtual/schema";
import type { MCPProxyClient } from "../../api/routes/proxy";

/** Entry in the proxy map (connection ID -> proxy entry) */
export interface ProxyEntry {
  proxy: MCPProxyClient;
  connection: ConnectionEntity;
}

/**
 * Aggregator tool selection strategy
 * - "passthrough": Pass tools through as-is (default)
 * - "smart_tool_selection": Smart tool selection behavior
 * - "code_execution": Code execution behavior
 */
export type ToolSelectionStrategy =
  | "passthrough"
  | "smart_tool_selection"
  | "code_execution";

/** Options for creating an aggregator */
export interface VirtualClientOptions {
  connections: ConnectionEntity[];
  selected: VirtualMCPConnection[];
}

/**
 * Parse strategy from mode query parameter
 */
export function parseStrategyFromMode(
  mode: string | undefined,
): ToolSelectionStrategy {
  switch (mode) {
    case "smart_tool_selection":
      return "smart_tool_selection";
    case "code_execution":
      return "code_execution";
    case "passthrough":
    default:
      return "passthrough";
  }
}

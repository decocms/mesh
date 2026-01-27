/**
 * Virtual MCP Client
 *
 * Client implementations for aggregating MCP resources from multiple connections
 */

export {
  createMCPAggregatorFromEntity,
  type VirtualMCPClient,
} from "./factory";
export type { ToolWithConnection } from "../../tools/code-execution/utils";
export type {
  AggregatorToolSelectionStrategy,
  AggregatorOptions,
  MCPProxy,
  ProxyEntry,
} from "./types";
export { parseStrategyFromMode } from "./types";

/**
 * Aggregator Abstractions
 *
 * Lazy-loading aggregators for aggregating MCP resources from multiple connections
 */

export { createMCPAggregatorFromEntity } from "./factory";
export {
  type ToolWithConnection,
  type StrategyContext,
  type StrategyResult,
  type ToolSelectionStrategyFn,
} from "./strategy";
export type {
  AggregatorClient,
  AggregatorOptions,
  MCPProxy,
  ProxyEntry,
} from "./types";

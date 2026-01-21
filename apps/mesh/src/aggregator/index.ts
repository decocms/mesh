/**
 * Aggregator Abstractions
 *
 * Lazy-loading aggregators for aggregating MCP resources from multiple connections
 */

export { ProxyCollection } from "./proxy-collection";
export { ToolAggregator, type ToolAggregatorOptions } from "./tool-aggregator";
export { ResourceAggregator } from "./resource-aggregator";
export { ResourceTemplateAggregator } from "./resource-template-aggregator";
export { PromptAggregator } from "./prompt-aggregator";
export {
  createMCPAggregator,
  createMCPAggregatorFromEntity,
} from "./factory";
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

/**
 * Gateway Abstractions
 *
 * Lazy-loading gateways for aggregating MCP resources from multiple connections
 */

export { ProxyCollection } from "./proxy-collection";
export { ToolGateway, type ToolGatewayOptions } from "./tool-gateway";
export { ResourceGateway } from "./resource-gateway";
export { ResourceTemplateGateway } from "./resource-template-gateway";
export { PromptGateway } from "./prompt-gateway";
export {
  getStrategy,
  type ToolWithConnection,
  type StrategyContext,
  type StrategyResult,
  type ToolSelectionStrategyFn,
} from "./strategy";
export type {
  GatewayClient,
  GatewayOptions,
  MCPProxy,
  ProxyEntry,
} from "./types";

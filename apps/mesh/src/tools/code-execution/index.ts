/**
 * Code Execution Tools
 *
 * MCP tools for searching, describing, and executing code with tools.
 * These tools can operate on:
 * - Gateway-specific connections (when ctx.gatewayId is set)
 * - All organization connections (when no gateway is specified)
 */

export { CODE_EXECUTION_SEARCH_TOOLS } from "./search";
export { CODE_EXECUTION_DESCRIBE_TOOLS } from "./describe";
export { CODE_EXECUTION_RUN_CODE } from "./run";

// Re-export schemas
export * from "./schema";

// Re-export utilities for use by gateway strategy
export {
  searchTools,
  describeTools,
  runCodeWithTools,
  getToolsWithConnections,
  resolveGatewayConnections,
  getAllOrgConnections,
  filterCodeExecutionTools,
  jsonResult,
  jsonError,
  CODE_EXECUTION_TOOL_NAMES,
  type ToolWithConnection,
  type ToolContext,
  type ToolDescription,
  type ConnectionWithSelection,
} from "./utils";

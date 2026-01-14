/**
 * Gateway Tool Selection Strategies
 *
 * Each strategy is a function that transforms tools:
 * - passthrough: (tools) => tools
 * - smart_tool_selection: (tools) => [search, describe, execute]
 * - code_execution: (tools) => [search, describe, run_code]
 *
 * Uses shared utilities from tools/code-execution/utils.ts for 100% code reuse.
 */

import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  createSearchToolHandler,
  createDescribeToolHandler,
  createCallToolHandler,
  createRunCodeToolHandler,
  type ToolWithConnection,
  type ToolContext,
  type ToolWithHandler,
} from "../tools/code-execution/utils.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Gateway tool selection strategy
 * - "passthrough": Pass tools through as-is (default)
 * - "smart_tool_selection": Smart tool selection behavior
 * - "code_execution": Code execution behavior
 */
export type GatewayToolSelectionStrategy =
  | "passthrough"
  | "smart_tool_selection"
  | "code_execution";

// Re-export ToolWithConnection for backwards compatibility
export type { ToolWithConnection };

/** Context provided to strategy functions (same as ToolContext) */
export type StrategyContext = ToolContext;

/** Result from a strategy - the tools to expose and how to handle calls */
export interface StrategyResult {
  /** Tools to expose via list_tools */
  tools: (Tool & { metadata?: unknown })[];
  /** Handler for call_tool requests */
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<CallToolResult>;
}

/** Strategy function signature */
export type ToolSelectionStrategyFn = (ctx: StrategyContext) => StrategyResult;

// ============================================================================
// Strategy Helpers
// ============================================================================

function createStrategyFromTools(
  toolsWithHandlers: ToolWithHandler[],
): StrategyResult {
  const handlerMap = new Map(
    toolsWithHandlers.map((t) => [t.tool.name, t.handler]),
  );

  const toolNames = toolsWithHandlers.map((t) => t.tool.name);

  return {
    tools: toolsWithHandlers.map((t) => t.tool),
    callTool: async (name, args) => {
      const handler = handlerMap.get(name);
      if (!handler) {
        return {
          content: [
            {
              type: "text",
              text: `Unknown meta-tool: ${name}. Available: ${toolNames.join(", ")}`,
            },
          ],
          isError: true,
        };
      }
      return handler(args);
    },
  };
}

// ============================================================================
// Strategies
// ============================================================================

/**
 * Passthrough strategy: expose all tools directly
 *
 * (tools) => tools
 */
const passthroughStrategy: ToolSelectionStrategyFn = (ctx) => ({
  tools: ctx.tools,
  callTool: (name, args) => ctx.callTool(name, args),
});

/**
 * Code execution strategy: expose meta-tools for discovery and code execution.
 *
 * (tools) => [GATEWAY_SEARCH_TOOLS, GATEWAY_DESCRIBE_TOOLS, GATEWAY_RUN_CODE]
 *
 * Note: CODE_EXECUTION_* tools are filtered from search results to avoid
 * duplication (since they're already exposed as GATEWAY_* equivalents).
 */
const codeExecutionStrategy: ToolSelectionStrategyFn = (ctx) =>
  createStrategyFromTools([
    createSearchToolHandler(ctx, "GATEWAY", true),
    createDescribeToolHandler(ctx, "GATEWAY", true),
    createRunCodeToolHandler(ctx, "GATEWAY", true),
  ]);

/**
 * Smart tool selection strategy: expose meta-tools for dynamic discovery
 *
 * (tools) => [GATEWAY_SEARCH_TOOLS, GATEWAY_DESCRIBE_TOOLS, GATEWAY_CALL_TOOL]
 *
 * Note: CODE_EXECUTION_* tools are filtered from search results to avoid
 * duplication (since they're already exposed as GATEWAY_* equivalents).
 */
const smartToolSelectionStrategy: ToolSelectionStrategyFn = (ctx) =>
  createStrategyFromTools([
    createSearchToolHandler(ctx, "GATEWAY", true),
    createDescribeToolHandler(ctx, "GATEWAY", true),
    createCallToolHandler(ctx, "GATEWAY", true),
  ]);

// ============================================================================
// Strategy Registry
// ============================================================================

/** Get the strategy function for a given strategy name */
export function getStrategy(
  strategy: GatewayToolSelectionStrategy,
): ToolSelectionStrategyFn {
  switch (strategy) {
    case "smart_tool_selection":
      return smartToolSelectionStrategy;
    case "code_execution":
      return codeExecutionStrategy;
    case "passthrough":
    default:
      return passthroughStrategy;
  }
}

export function parseStrategyFromMode(
  mode: string | undefined,
): GatewayToolSelectionStrategy {
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

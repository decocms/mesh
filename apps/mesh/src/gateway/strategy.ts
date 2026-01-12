/**
 * Gateway Tool Selection Strategy
 *
 * Runtime strategy type for gateway behavior (not persisted).
 * Parsed from query string `?mode=` parameter.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type GatewayToolSelectionStrategy =
  | "passthrough"
  | "smart_tool_selection"
  | "code_execution";

/**
 * Parse strategy from query string mode parameter
 * @param mode - Query string value for `mode` parameter
 * @returns Valid strategy, defaults to "passthrough" if missing or invalid
 */
export function parseStrategyFromMode(
  mode: string | undefined,
): GatewayToolSelectionStrategy {
  if (!mode) {
    return "passthrough";
  }

  const validStrategies: GatewayToolSelectionStrategy[] = [
    "passthrough",
    "smart_tool_selection",
    "code_execution",
  ];

  if (validStrategies.includes(mode as GatewayToolSelectionStrategy)) {
    return mode as GatewayToolSelectionStrategy;
  }

  return "passthrough";
}

/**
 * Tool with connection metadata
 */
export interface ToolWithConnection {
  name: string;
  description?: string;
  inputSchema?: unknown;
  _meta: {
    connectionId: string;
    connectionTitle: string;
  };
}

/**
 * Context passed to strategy functions
 */
export interface StrategyContext {
  tools: ToolWithConnection[];
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<CallToolResult>;
  categories: string[];
}

/**
 * Result returned by strategy functions
 */
export interface StrategyResult {
  tools: ToolWithConnection[];
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<CallToolResult>;
}

/**
 * Strategy function type
 */
export type ToolSelectionStrategyFn = (
  context: StrategyContext,
) => StrategyResult;

/**
 * Get strategy function for a given strategy type
 */
export function getStrategy(
  _strategy: GatewayToolSelectionStrategy,
): ToolSelectionStrategyFn {
  // For now, all strategies are passthrough (no transformation)
  // Future implementations will add smart_tool_selection and code_execution logic
  return (context: StrategyContext): StrategyResult => {
    return {
      tools: context.tools,
      callTool: context.callTool,
    };
  };
}

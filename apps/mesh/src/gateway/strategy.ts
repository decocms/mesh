/**
 * Gateway Tool Selection Strategies
 *
 * Each strategy is a function that transforms tools:
 * - passthrough: (tools) => tools
 * - smart_tool_selection: (tools) => [search, describe, execute]
 * - code_execution: (tools) => [search, describe, run_code]
 *
 * Uses shared utilities from tools/code-execution/utils.ts to avoid duplication.
 */

import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { runCode } from "../sandbox/index.ts";
import {
  searchTools,
  describeTools,
  filterCodeExecutionTools,
  jsonResult,
  jsonError,
  type ToolWithConnection,
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

type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;

interface ToolWithHandler {
  tool: Tool;
  handler: ToolHandler;
}

// Re-export ToolWithConnection for backwards compatibility
export type { ToolWithConnection };

/** Context provided to strategy functions */
export interface StrategyContext {
  /** All aggregated tools from connections */
  tools: ToolWithConnection[];
  /** Execute a tool by name (routes to correct connection) */
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<CallToolResult>;
  /** Connection categories for descriptions */
  categories: string[];
}

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
// Tool Factories
// ============================================================================

function createSearchTool(ctx: StrategyContext): ToolWithHandler {
  const inputSchema = z.object({
    query: z
      .string()
      .describe(
        "Natural language search query (e.g., 'send email', 'create order')",
      ),
    limit: z
      .number()
      .default(10)
      .describe("Maximum results to return (default: 10)"),
  });

  // Filter out CODE_EXECUTION_* tools to avoid duplication
  const filteredTools = filterCodeExecutionTools(ctx.tools);

  const categoryList =
    ctx.categories.length > 0
      ? ` Available categories: ${ctx.categories.join(", ")}.`
      : "";

  return {
    tool: {
      name: "GATEWAY_SEARCH_TOOLS",
      description: `Search for available tools by name or description. Returns tool names and brief descriptions without full schemas.${categoryList} Total tools: ${filteredTools.length}.`,
      inputSchema: z.toJSONSchema(inputSchema) as Tool["inputSchema"],
    },
    handler: async (args) => {
      const parsed = inputSchema.safeParse(args);
      if (!parsed.success) {
        return jsonError({ error: parsed.error.flatten() });
      }

      // Use shared search logic with filtered tools
      const results = searchTools(
        parsed.data.query,
        filteredTools,
        parsed.data.limit,
      );
      return jsonResult({
        query: parsed.data.query,
        results: results.map((t) => ({
          name: t.name,
          description: t.description,
          connection: t._meta.connectionTitle,
        })),
        totalAvailable: filteredTools.length,
      });
    },
  };
}

function createDescribeTool(ctx: StrategyContext): ToolWithHandler {
  const inputSchema = z.object({
    tools: z
      .array(z.string())
      .min(1)
      .describe("Array of tool names to get detailed schemas for"),
  });

  // Filter out CODE_EXECUTION_* tools to avoid duplication
  const filteredTools = filterCodeExecutionTools(ctx.tools);

  return {
    tool: {
      name: "GATEWAY_DESCRIBE_TOOLS",
      description:
        "Get detailed schemas for specific tools. Call after searching to get full input/output schemas.",
      inputSchema: z.toJSONSchema(inputSchema) as Tool["inputSchema"],
    },
    handler: async (args) => {
      const parsed = inputSchema.safeParse(args);
      if (!parsed.success) {
        return jsonError({ error: parsed.error.flatten() });
      }

      // Use shared describe logic with filtered tools
      const result = describeTools(parsed.data.tools, filteredTools);
      return jsonResult({
        tools: result.tools,
        notFound: result.notFound,
      });
    },
  };
}

function createCallTool(ctx: StrategyContext): ToolWithHandler {
  // Filter out CODE_EXECUTION_* tools to avoid duplication
  const filteredTools = filterCodeExecutionTools(ctx.tools);
  const toolNames = filteredTools.map((t) => t.name);
  const toolMap = new Map(filteredTools.map((t) => [t.name, t]));

  const inputSchema = z.object({
    name: z
      .enum(toolNames as [string, ...string[]])
      .describe("The name of the tool to execute"),
    arguments: z
      .record(z.string(), z.unknown())
      .default({})
      .describe("Arguments to pass to the tool"),
  });

  return {
    tool: {
      name: "GATEWAY_CALL_TOOL",
      description:
        "Execute a tool by name. Use GATEWAY_DESCRIBE_TOOLS first to understand the input schema.",
      inputSchema: z.toJSONSchema(inputSchema) as Tool["inputSchema"],
    },
    handler: async (args) => {
      const parsed = inputSchema.safeParse(args);
      if (!parsed.success) {
        return jsonError({ error: parsed.error.flatten() });
      }

      const { name: innerName, arguments: innerArgs } = parsed.data;

      if (!toolMap.has(innerName)) {
        return {
          content: [
            {
              type: "text",
              text: `Tool not found: ${innerName}. Use GATEWAY_SEARCH_TOOLS to find available tools.`,
            },
          ],
          isError: true,
        };
      }

      return ctx.callTool(innerName, innerArgs);
    },
  };
}

function createRunCodeTool(ctx: StrategyContext): ToolWithHandler {
  const inputSchema = z.object({
    code: z
      .string()
      .min(1)
      .describe(
        "JavaScript code to execute. It runs as an async function body; you can use top-level `return` and `await`.",
      ),
    timeoutMs: z
      .number()
      .default(3000)
      .describe("Max execution time in milliseconds (default: 3000)."),
  });

  // Filter out CODE_EXECUTION_* tools to avoid duplication
  const filteredTools = filterCodeExecutionTools(ctx.tools);

  return {
    tool: {
      name: "GATEWAY_RUN_CODE",
      description:
        'Run JavaScript code in a sandbox. Code must be an ES module that `export default`s an async function that receives (tools) as its first parameter. Use GATEWAY_DESCRIBE_TOOLS to understand the input/output schemas for a tool before calling it. Use `await tools.toolName(args)` or `await tools["tool-name"](args)` to call tools.',
      inputSchema: z.toJSONSchema(inputSchema) as Tool["inputSchema"],
    },
    handler: async (args) => {
      const parsed = inputSchema.safeParse(args);
      if (!parsed.success) {
        return jsonError({ error: parsed.error.flatten() });
      }

      const toolsRecord: Record<
        string,
        (args: Record<string, unknown>) => Promise<CallToolResult>
      > = Object.fromEntries(
        filteredTools.map((tool) => [
          tool.name,
          async (innerArgs) => ctx.callTool(tool.name, innerArgs ?? {}),
        ]),
      );

      const result = await runCode({ ...parsed.data, tools: toolsRecord });

      if (result.error) {
        return jsonError(result);
      }

      return jsonResult(result);
    },
  };
}

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
    createSearchTool(ctx),
    createDescribeTool(ctx),
    createRunCodeTool(ctx),
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
    createSearchTool(ctx),
    createDescribeTool(ctx),
    createCallTool(ctx),
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

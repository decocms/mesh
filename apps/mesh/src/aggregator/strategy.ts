/**
 * Aggregator Tool Selection Strategies
 *
 * Each strategy is a function that transforms tools:
 * - passthrough: (tools) => tools
 * - smart_tool_selection: (tools) => [search, describe, execute]
 * - code_execution: (tools) => [search, describe, run_code]
 *
 * Uses shared utilities from tools/code-execution/utils.ts for core logic.
 */

import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  describeTools,
  filterCodeExecutionTools,
  jsonError,
  jsonResult,
  runCodeWithTools,
  searchTools,
  type ToolContext,
  type ToolWithConnection,
} from "../tools/code-execution/utils.ts";

// ============================================================================
// Types
// ============================================================================

/**
 * Aggregator tool selection strategy
 * - "passthrough": Pass tools through as-is (default)
 * - "smart_tool_selection": Smart tool selection behavior
 * - "code_execution": Code execution behavior
 */
export type AggregatorToolSelectionStrategy =
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
// Cached JSON Schemas (avoid repeated z.toJSONSchema calls)
// Zod 4's toJSONSchema accumulates in __zod_globalRegistry causing memory leaks
// ============================================================================

const SEARCH_INPUT_SCHEMA = z.object({
  query: z
    .string()
    .min(1)
    .describe("Search query to find tools by name or description"),
  limit: z.number().default(10).describe("Maximum number of results to return"),
});
const SEARCH_INPUT_JSON_SCHEMA = z.toJSONSchema(
  SEARCH_INPUT_SCHEMA,
) as Tool["inputSchema"];

const DESCRIBE_INPUT_SCHEMA = z.object({
  tools: z
    .array(z.string())
    .min(1)
    .describe("Array of tool names to get detailed schemas for"),
});
const DESCRIBE_INPUT_JSON_SCHEMA = z.toJSONSchema(
  DESCRIBE_INPUT_SCHEMA,
) as Tool["inputSchema"];

const RUN_CODE_INPUT_SCHEMA = z.object({
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
const RUN_CODE_INPUT_JSON_SCHEMA = z.toJSONSchema(
  RUN_CODE_INPUT_SCHEMA,
) as Tool["inputSchema"];

type CallToolInput = {
  name: string;
  arguments: Record<string, unknown>;
};

// Cache for dynamic CALL_TOOL schemas (keyed by sorted tool names)
const callToolSchemaCache = new Map<
  string,
  { schema: z.ZodType<CallToolInput>; jsonSchema: Tool["inputSchema"] }
>();

function getCallToolSchema(toolNames: string[]): {
  schema: z.ZodType<CallToolInput>;
  jsonSchema: Tool["inputSchema"];
} {
  const cacheKey = toolNames.slice().sort().join(",");
  let cached = callToolSchemaCache.get(cacheKey);
  if (!cached) {
    const schema: z.ZodType<CallToolInput> = z.object({
      name: (toolNames.length > 0
        ? z.enum(toolNames as [string, ...string[]])
        : z.string()
      ).describe("The name of the tool to execute"),
      arguments: z
        .record(z.string(), z.unknown())
        .default({})
        .describe("Arguments to pass to the tool"),
    });
    cached = {
      schema,
      jsonSchema: z.toJSONSchema(schema) as Tool["inputSchema"],
    };
    callToolSchemaCache.set(cacheKey, cached);
  }
  return cached;
}

// ============================================================================
// Tool Factories (Aggregator-specific)
// ============================================================================

function createSearchTool(ctx: StrategyContext): ToolWithHandler {
  // Filter out CODE_EXECUTION_* tools to avoid duplication
  const filteredTools = filterCodeExecutionTools(ctx.tools);

  const categoryList =
    ctx.categories.length > 0
      ? ` Available categories: ${ctx.categories.join(", ")}.`
      : "";

  return {
    tool: {
      name: "GATEWAY_SEARCH_TOOLS",
      description: `Search for available tools by name or description. Returns tool names and brief descriptions without full schemas. Use this to discover tools before calling GATEWAY_DESCRIBE_TOOLS for detailed schemas.${categoryList} Total tools: ${filteredTools.length}.`,
      inputSchema: SEARCH_INPUT_JSON_SCHEMA,
    },
    handler: async (args) => {
      const parsed = SEARCH_INPUT_SCHEMA.safeParse(args);
      if (!parsed.success) {
        return jsonError({ error: parsed.error.flatten() });
      }

      // Use shared search logic
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
  // Filter out CODE_EXECUTION_* tools to avoid duplication
  const filteredTools = filterCodeExecutionTools(ctx.tools);

  return {
    tool: {
      name: "GATEWAY_DESCRIBE_TOOLS",
      description:
        "Get detailed schemas for specific tools. Call after GATEWAY_SEARCH_TOOLS to get full input/output schemas.",
      inputSchema: DESCRIBE_INPUT_JSON_SCHEMA,
    },
    handler: async (args) => {
      const parsed = DESCRIBE_INPUT_SCHEMA.safeParse(args);
      if (!parsed.success) {
        return jsonError({ error: parsed.error.flatten() });
      }

      // Use shared describe logic
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

  // Use cached schema to avoid repeated z.toJSONSchema calls
  const { schema: inputSchema, jsonSchema } = getCallToolSchema(toolNames);

  return {
    tool: {
      name: "GATEWAY_CALL_TOOL",
      description:
        "Execute a tool by name. Use GATEWAY_DESCRIBE_TOOLS first to understand the input schema.",
      inputSchema: jsonSchema,
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
  // Filter out CODE_EXECUTION_* tools to avoid duplication
  const filteredTools = filterCodeExecutionTools(ctx.tools);

  return {
    tool: {
      name: "GATEWAY_RUN_CODE",
      description:
        'Run JavaScript code in a sandbox. Code must be an ES module that `export default`s an async function that receives (tools) as its first parameter. Use GATEWAY_DESCRIBE_TOOLS to understand the input/output schemas for a tool before calling it. Use `await tools.toolName(args)` or `await tools["tool-name"](args)` to call tools.',
      inputSchema: RUN_CODE_INPUT_JSON_SCHEMA,
    },
    handler: async (args) => {
      const parsed = RUN_CODE_INPUT_SCHEMA.safeParse(args);
      if (!parsed.success) {
        return jsonError({ error: parsed.error.flatten() });
      }

      // Create filtered context for runCodeWithTools
      const filteredContext: ToolContext = {
        ...ctx,
        tools: filteredTools,
      };

      // Use shared run code logic
      const result = await runCodeWithTools(
        parsed.data.code,
        filteredContext,
        parsed.data.timeoutMs,
      );

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
  strategy: AggregatorToolSelectionStrategy,
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
): AggregatorToolSelectionStrategy {
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

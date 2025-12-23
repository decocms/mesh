/**
 * Gateway Tool Selection Strategies
 *
 * Each strategy is a function that transforms tools:
 * - passthrough: (tools) => tools
 * - smart_tool_selection: (tools) => [search, describe, execute]
 */

import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { GatewayToolSelectionStrategy } from "../storage/types";

// ============================================================================
// Types
// ============================================================================

/** Extended tool info with connection metadata */
export interface ToolWithConnection extends Tool {
  connectionId: string;
  connectionTitle: string;
}

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
  tools: Tool[];
  /** Handler for call_tool requests */
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<CallToolResult>;
}

/** Strategy function signature */
export type ToolSelectionStrategyFn = (ctx: StrategyContext) => StrategyResult;

// ============================================================================
// Keyword Search
// ============================================================================

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s_\-./]+/)
    .filter((term) => term.length >= 2);
}

function calculateScore(terms: string[], tool: ToolWithConnection): number {
  let score = 0;
  const nameLower = tool.name.toLowerCase();
  const descLower = (tool.description ?? "").toLowerCase();
  const connLower = tool.connectionTitle.toLowerCase();

  for (const term of terms) {
    if (nameLower === term) {
      score += 10;
    } else if (nameLower.includes(term)) {
      score += 3;
    }
    if (descLower.includes(term)) {
      score += 2;
    }
    if (connLower.includes(term)) {
      score += 1;
    }
  }

  return score;
}

function searchTools(
  query: string,
  tools: ToolWithConnection[],
  limit: number,
): ToolWithConnection[] {
  const terms = tokenize(query);

  if (terms.length === 0) {
    return tools.slice(0, limit);
  }

  return tools
    .map((tool) => ({ tool, score: calculateScore(terms, tool) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.tool);
}

// ============================================================================
// Passthrough Strategy
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

// ============================================================================
// Smart Tool Selection Strategy
// ============================================================================

/** Meta-tool names */
const META_TOOLS = {
  SEARCH: "GATEWAY_SEARCH_TOOLS",
  DESCRIBE: "GATEWAY_DESCRIBE_TOOLS",
  CALL: "GATEWAY_CALL_TOOL",
} as const;

/**
 * Create meta-tools for smart gateway
 */
function createMetaTools(ctx: StrategyContext): Tool[] {
  const categoryList =
    ctx.categories.length > 0
      ? ` Available categories: ${ctx.categories.join(", ")}.`
      : "";

  const toolNames = ctx.tools.map((t) => t.name);

  return [
    {
      name: META_TOOLS.SEARCH,
      description: `Search for available tools by name or description. Returns tool names and brief descriptions without full schemas.${categoryList} Total tools: ${ctx.tools.length}.`,
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Natural language search query (e.g., 'send email', 'create order')",
          },
          limit: {
            type: "number",
            description: "Maximum results to return (default: 10)",
            default: 10,
          },
        },
        required: ["query"],
      },
    },
    {
      name: META_TOOLS.DESCRIBE,
      description:
        "Get detailed schemas for specific tools. Call after searching to get full input/output schemas.",
      inputSchema: {
        type: "object",
        properties: {
          tools: {
            type: "array",
            items: { type: "string", enum: toolNames },
            description: "Array of tool names to get detailed schemas for",
          },
        },
        required: ["tools"],
      },
    },
    {
      name: META_TOOLS.CALL,
      description:
        "Execute a tool by name. Use GATEWAY_DESCRIBE_TOOLS first to understand the input schema.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            enum: toolNames,
            description: "The name of the tool to execute",
          },
          arguments: {
            type: "object",
            description: "Arguments to pass to the tool",
            additionalProperties: true,
          },
        },
        required: ["name"],
      },
    },
  ];
}

/**
 * Smart tool selection strategy: expose meta-tools for dynamic discovery
 *
 * (tools) => [GATEWAY_SEARCH_TOOLS, GATEWAY_DESCRIBE_TOOLS, GATEWAY_CALL_TOOL]
 */
const smartToolSelectionStrategy: ToolSelectionStrategyFn = (ctx) => {
  const toolMap = new Map(ctx.tools.map((t) => [t.name, t]));

  const callTool = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> => {
    switch (name) {
      case META_TOOLS.SEARCH: {
        const query = (args.query as string) ?? "";
        const limit = (args.limit as number) ?? 10;
        const results = searchTools(query, ctx.tools, limit);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  query,
                  results: results.map((t) => ({
                    name: t.name,
                    description: t.description,
                    connection: t.connectionTitle,
                  })),
                  totalAvailable: ctx.tools.length,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case META_TOOLS.DESCRIBE: {
        const toolNames = (args.tools as string[]) ?? [];

        if (toolNames.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: "No tool names provided" }),
              },
            ],
            isError: true,
          };
        }

        const tools = toolNames
          .map((n) => toolMap.get(n))
          .filter((t): t is ToolWithConnection => t !== undefined);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  tools: tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    connection: t.connectionTitle,
                    inputSchema: t.inputSchema,
                    outputSchema: t.outputSchema,
                  })),
                  notFound: toolNames.filter((n) => !toolMap.has(n)),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      case META_TOOLS.CALL: {
        const innerName = args.name as string;
        const innerArgs = (args.arguments as Record<string, unknown>) ?? {};

        if (!innerName) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: "Tool name is required" }),
              },
            ],
            isError: true,
          };
        }

        if (!toolMap.has(innerName)) {
          return {
            content: [
              {
                type: "text",
                text: `Tool not found: ${innerName}. Use ${META_TOOLS.SEARCH} to find available tools.`,
              },
            ],
            isError: true,
          };
        }

        return ctx.callTool(innerName, innerArgs);
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown meta-tool: ${name}. Available: ${Object.values(META_TOOLS).join(", ")}`,
            },
          ],
          isError: true,
        };
    }
  };

  return { tools: createMetaTools(ctx), callTool };
};

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
      // TODO: Implement code execution strategy
      return passthroughStrategy;
    case "passthrough":
    default:
      return passthroughStrategy;
  }
}

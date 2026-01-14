/**
 * CODE_EXECUTION Shared Utilities
 *
 * Core reusable logic for code execution tools and gateway strategies.
 * Used by both:
 * - Management MCP tools (CODE_EXECUTION_*)
 * - Gateway query string strategy (?mode=code_execution)
 */

import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { MeshContext } from "../../core/mesh-context";
import { requireOrganization } from "../../core/mesh-context";
import { ProxyCollection } from "../../gateway/proxy-collection";
import type { ToolSelectionMode } from "../../storage/types";
import { runCode, type RunCodeResult } from "../../sandbox/index";
import type { ConnectionEntity } from "../connection/schema";
import type { GatewayEntity } from "../gateway/schema";

// ============================================================================
// Types
// ============================================================================

/** Extended tool info with connection metadata */
export interface ToolWithConnection extends Tool {
  _meta: {
    connectionId: string;
    connectionTitle: string;
  };
}

/** Connection with tool/resource/prompt selection */
interface ConnectionWithSelection {
  connection: ConnectionEntity;
  selectedTools: string[] | null;
  selectedResources: string[] | null;
  selectedPrompts: string[] | null;
}

/** Context for code execution tools */
export interface ToolContext {
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

/** Tool description for describe tools output */
interface ToolDescription {
  name: string;
  description?: string;
  connection: string;
  inputSchema: unknown;
  outputSchema?: unknown;
}

// ============================================================================
// Connection Resolution
// ============================================================================

/**
 * Resolve gateway connections with exclusion/inclusion logic
 */
async function resolveGatewayConnections(
  gateway: GatewayEntity,
  ctx: MeshContext,
): Promise<ConnectionWithSelection[]> {
  let connections: ConnectionWithSelection[];

  if (gateway.tool_selection_mode === "exclusion") {
    // Exclusion mode: list ALL org connections, then apply exclusion filter
    const allConnections = await ctx.storage.connections.list(
      gateway.organization_id,
    );
    const activeConnections = allConnections.filter(
      (c) => c.status === "active",
    );

    // Build a map of connection exclusions
    const exclusionMap = new Map<
      string,
      {
        selectedTools: string[] | null;
        selectedResources: string[] | null;
        selectedPrompts: string[] | null;
      }
    >();
    for (const gwConn of gateway.connections) {
      exclusionMap.set(gwConn.connection_id, {
        selectedTools: gwConn.selected_tools,
        selectedResources: gwConn.selected_resources,
        selectedPrompts: gwConn.selected_prompts,
      });
    }

    connections = [];
    for (const conn of activeConnections) {
      const exclusionEntry = exclusionMap.get(conn.id);

      if (exclusionEntry === undefined) {
        // Connection NOT in gateway.connections -> include all
        connections.push({
          connection: conn,
          selectedTools: null,
          selectedResources: null,
          selectedPrompts: null,
        });
      } else if (
        (exclusionEntry.selectedTools === null ||
          exclusionEntry.selectedTools.length === 0) &&
        (exclusionEntry.selectedResources === null ||
          exclusionEntry.selectedResources.length === 0) &&
        (exclusionEntry.selectedPrompts === null ||
          exclusionEntry.selectedPrompts.length === 0)
      ) {
        // Connection in gateway.connections with all null/empty -> exclude entire connection
        // Skip this connection
      } else {
        // Connection in gateway.connections with specific exclusions
        connections.push({
          connection: conn,
          selectedTools: exclusionEntry.selectedTools,
          selectedResources: exclusionEntry.selectedResources,
          selectedPrompts: exclusionEntry.selectedPrompts,
        });
      }
    }
  } else {
    // Inclusion mode (default): use only the connections specified in gateway
    const connectionIds = gateway.connections.map((c) => c.connection_id);
    const loadedConnections: ConnectionEntity[] = [];

    for (const connId of connectionIds) {
      const conn = await ctx.storage.connections.findById(connId);
      if (conn && conn.status === "active") {
        loadedConnections.push(conn);
      }
    }

    connections = loadedConnections.map((conn) => {
      const gwConn = gateway.connections.find(
        (c) => c.connection_id === conn.id,
      );
      return {
        connection: conn,
        selectedTools: gwConn?.selected_tools ?? null,
        selectedResources: gwConn?.selected_resources ?? null,
        selectedPrompts: gwConn?.selected_prompts ?? null,
      };
    });
  }

  return connections;
}

/**
 * Get all active connections for an organization
 */
async function getAllOrgConnections(
  organizationId: string,
  ctx: MeshContext,
): Promise<ConnectionWithSelection[]> {
  const allConnections = await ctx.storage.connections.list(organizationId);
  return allConnections
    .filter((c) => c.status === "active")
    .map((connection) => ({
      connection,
      selectedTools: null,
      selectedResources: null,
      selectedPrompts: null,
    }));
}

// ============================================================================
// Tool Loading
// ============================================================================

/** Maps tool name -> { connectionId, originalName } */
interface ToolMapping {
  connectionId: string;
  originalName: string;
}

/**
 * Load tools from connections and create tool context
 */
async function loadToolsFromConnections(
  connections: ConnectionWithSelection[],
  selectionMode: ToolSelectionMode,
  ctx: MeshContext,
): Promise<ToolContext> {
  // Create proxy collection
  const proxies = await ProxyCollection.create(connections, ctx);

  // Fetch tools from all connections in parallel
  const results = await proxies.mapSettled(async (entry, connectionId) => {
    try {
      const result = await entry.proxy.client.listTools();
      let tools = result.tools;

      // Apply selection based on mode
      if (selectionMode === "exclusion") {
        if (entry.selectedTools && entry.selectedTools.length > 0) {
          const excludeSet = new Set(entry.selectedTools);
          tools = tools.filter((t) => !excludeSet.has(t.name));
        }
      } else {
        if (entry.selectedTools && entry.selectedTools.length > 0) {
          const selectedSet = new Set(entry.selectedTools);
          tools = tools.filter((t) => selectedSet.has(t.name));
        }
      }

      return {
        connectionId,
        connectionTitle: entry.connection.title,
        tools,
      };
    } catch (error) {
      console.error(
        `[code-execution] Failed to list tools for connection ${connectionId}:`,
        error,
      );
      return null;
    }
  });

  // Deduplicate and build tools with connection metadata
  const seenNames = new Set<string>();
  const allTools: ToolWithConnection[] = [];
  const mappings = new Map<string, ToolMapping>();
  const categories = new Set<string>();

  for (const result of results) {
    if (result.status !== "fulfilled" || !result.value) continue;

    const { connectionId, connectionTitle, tools } = result.value;
    categories.add(connectionTitle);

    for (const tool of tools) {
      if (seenNames.has(tool.name)) continue;
      seenNames.add(tool.name);

      allTools.push({
        ...tool,
        _meta: { connectionId, connectionTitle },
      });
      mappings.set(tool.name, { connectionId, originalName: tool.name });
    }
  }

  // Create base callTool that routes to the correct connection
  const callTool = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> => {
    const mapping = mappings.get(name);
    if (!mapping) {
      return {
        content: [{ type: "text", text: `Tool not found: ${name}` }],
        isError: true,
      };
    }

    const proxyEntry = proxies.get(mapping.connectionId);
    if (!proxyEntry) {
      return {
        content: [
          { type: "text", text: `Connection not found for tool: ${name}` },
        ],
        isError: true,
      };
    }

    const result = await proxyEntry.proxy.client.callTool({
      name: mapping.originalName,
      arguments: args,
    });

    return result as CallToolResult;
  };

  return {
    tools: allTools,
    callTool,
    categories: Array.from(categories).sort(),
  };
}

/**
 * Get tools with connections from context
 *
 * If ctx.gatewayId is set, loads gateway-specific connections
 * Otherwise, loads ALL active connections for the organization
 */
export async function getToolsWithConnections(
  ctx: MeshContext,
): Promise<ToolContext> {
  const organization = requireOrganization(ctx);

  let connections: ConnectionWithSelection[];
  let selectionMode: ToolSelectionMode = "inclusion";

  if (ctx.gatewayId) {
    // Use gateway-specific connections
    const gateway = await ctx.storage.gateways.findById(ctx.gatewayId);
    if (!gateway) {
      throw new Error(`Gateway not found: ${ctx.gatewayId}`);
    }
    connections = await resolveGatewayConnections(gateway, ctx);
    selectionMode = gateway.tool_selection_mode;
  } else {
    // Use ALL active org connections
    connections = await getAllOrgConnections(organization.id, ctx);
  }

  return loadToolsFromConnections(connections, selectionMode, ctx);
}

// ============================================================================
// Search Tools
// ============================================================================

/**
 * Tokenize search query into terms
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s_\-./]+/)
    .filter((term) => term.length >= 2);
}

/**
 * Calculate relevance score for a tool
 */
function calculateScore(terms: string[], tool: ToolWithConnection): number {
  let score = 0;
  const nameLower = tool.name.toLowerCase();
  const descLower = (tool.description ?? "").toLowerCase();
  const connLower = tool._meta.connectionTitle.toLowerCase();

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

/**
 * Search tools by query
 *
 * @param query - Natural language search query
 * @param tools - Tools to search
 * @param limit - Maximum results to return
 * @returns Matching tools sorted by relevance
 */
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
// Describe Tools
// ============================================================================

/**
 * Get detailed descriptions for specific tools
 *
 * @param names - Tool names to describe
 * @param tools - All available tools
 * @returns Tool descriptions and not found names
 */
function describeTools(
  names: string[],
  tools: ToolWithConnection[],
): { tools: ToolDescription[]; notFound: string[] } {
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  const foundTools = names
    .map((n) => toolMap.get(n))
    .filter((t): t is ToolWithConnection => t !== undefined);

  return {
    tools: foundTools.map((t) => ({
      name: t.name,
      description: t.description,
      connection: t._meta.connectionTitle,
      inputSchema: t.inputSchema,
      outputSchema: t.outputSchema,
    })),
    notFound: names.filter((n) => !toolMap.has(n)),
  };
}

// ============================================================================
// Run Code
// ============================================================================

/**
 * Run JavaScript code with tools in a sandbox
 *
 * @param code - JavaScript ES module code to execute
 * @param toolContext - Tool context with callTool function
 * @param timeoutMs - Execution timeout in milliseconds
 * @returns Run result with return value, error, and console logs
 */
async function runCodeWithTools(
  code: string,
  toolContext: ToolContext,
  timeoutMs: number,
): Promise<RunCodeResult> {
  // Create tools record for sandbox
  const toolsRecord: Record<
    string,
    (args: Record<string, unknown>) => Promise<CallToolResult>
  > = Object.fromEntries(
    toolContext.tools.map((tool) => [
      tool.name,
      async (innerArgs) => toolContext.callTool(tool.name, innerArgs ?? {}),
    ]),
  );

  return runCode({
    code,
    tools: toolsRecord,
    timeoutMs,
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a JSON result for tool output
 */
function jsonResult(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Create a JSON error result for tool output
 */
function jsonError(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    isError: true,
  };
}

/**
 * Tool names to exclude from search results when used in gateway strategy
 * (to avoid duplication with meta-tools)
 */
const CODE_EXECUTION_TOOL_NAMES = [
  "CODE_EXECUTION_SEARCH_TOOLS",
  "CODE_EXECUTION_DESCRIBE_TOOLS",
  "CODE_EXECUTION_RUN_CODE",
] as const;

/**
 * Filter out CODE_EXECUTION_* tools from search results
 * Used by gateway strategy to avoid duplication
 */
function filterCodeExecutionTools(
  tools: ToolWithConnection[],
): ToolWithConnection[] {
  const excludeSet = new Set<string>(CODE_EXECUTION_TOOL_NAMES);
  return tools.filter((t) => !excludeSet.has(t.name));
}

// ============================================================================
// Tool Handler Factories
// ============================================================================

/** Tool handler type */
type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>;

/** Tool with handler for strategy */
export interface ToolWithHandler {
  tool: Tool;
  handler: ToolHandler;
}

/** Options for tool name prefix */
export type ToolNamePrefix = "GATEWAY" | "CODE_EXECUTION";

/**
 * Create a search tool with configurable name prefix
 *
 * @param toolContext - Tool context with tools and categories
 * @param prefix - Name prefix ("GATEWAY" or "CODE_EXECUTION")
 * @param filterTools - Whether to filter out CODE_EXECUTION_* tools (for gateway deduplication)
 */
export function createSearchToolHandler(
  toolContext: ToolContext,
  prefix: ToolNamePrefix,
  filterTools = false,
): ToolWithHandler {
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

  // Optionally filter out CODE_EXECUTION_* tools to avoid duplication
  const filteredTools = filterTools
    ? filterCodeExecutionTools(toolContext.tools)
    : toolContext.tools;

  const categoryList =
    toolContext.categories.length > 0
      ? ` Available categories: ${toolContext.categories.join(", ")}.`
      : "";

  const describeToolName =
    prefix === "GATEWAY"
      ? "GATEWAY_DESCRIBE_TOOLS"
      : "CODE_EXECUTION_DESCRIBE_TOOLS";

  return {
    tool: {
      name: `${prefix}_SEARCH_TOOLS`,
      description: `Search for available tools by name or description. Returns tool names and brief descriptions without full schemas. Use this to discover tools before calling ${describeToolName} for detailed schemas.${categoryList} Total tools: ${filteredTools.length}.`,
      inputSchema: z.toJSONSchema(inputSchema) as Tool["inputSchema"],
    },
    handler: async (args) => {
      const parsed = inputSchema.safeParse(args);
      if (!parsed.success) {
        return jsonError({ error: parsed.error.flatten() });
      }

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

/**
 * Create a describe tool with configurable name prefix
 *
 * @param toolContext - Tool context with tools
 * @param prefix - Name prefix ("GATEWAY" or "CODE_EXECUTION")
 * @param filterTools - Whether to filter out CODE_EXECUTION_* tools (for gateway deduplication)
 */
export function createDescribeToolHandler(
  toolContext: ToolContext,
  prefix: ToolNamePrefix,
  filterTools = false,
): ToolWithHandler {
  const inputSchema = z.object({
    tools: z
      .array(z.string())
      .min(1)
      .describe("Array of tool names to get detailed schemas for"),
  });

  // Optionally filter out CODE_EXECUTION_* tools to avoid duplication
  const filteredTools = filterTools
    ? filterCodeExecutionTools(toolContext.tools)
    : toolContext.tools;

  const searchToolName =
    prefix === "GATEWAY"
      ? "GATEWAY_SEARCH_TOOLS"
      : "CODE_EXECUTION_SEARCH_TOOLS";

  return {
    tool: {
      name: `${prefix}_DESCRIBE_TOOLS`,
      description: `Get detailed schemas for specific tools. Call after ${searchToolName} to get full input/output schemas.`,
      inputSchema: z.toJSONSchema(inputSchema) as Tool["inputSchema"],
    },
    handler: async (args) => {
      const parsed = inputSchema.safeParse(args);
      if (!parsed.success) {
        return jsonError({ error: parsed.error.flatten() });
      }

      const result = describeTools(parsed.data.tools, filteredTools);
      return jsonResult({
        tools: result.tools,
        notFound: result.notFound,
      });
    },
  };
}

/**
 * Create a call tool with configurable name prefix (for smart_tool_selection strategy)
 *
 * @param toolContext - Tool context with tools and callTool function
 * @param prefix - Name prefix ("GATEWAY" or "CODE_EXECUTION")
 * @param filterTools - Whether to filter out CODE_EXECUTION_* tools (for gateway deduplication)
 */
export function createCallToolHandler(
  toolContext: ToolContext,
  prefix: ToolNamePrefix,
  filterTools = false,
): ToolWithHandler {
  // Optionally filter out CODE_EXECUTION_* tools to avoid duplication
  const filteredTools = filterTools
    ? filterCodeExecutionTools(toolContext.tools)
    : toolContext.tools;
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

  const describeToolName =
    prefix === "GATEWAY"
      ? "GATEWAY_DESCRIBE_TOOLS"
      : "CODE_EXECUTION_DESCRIBE_TOOLS";
  const searchToolName =
    prefix === "GATEWAY"
      ? "GATEWAY_SEARCH_TOOLS"
      : "CODE_EXECUTION_SEARCH_TOOLS";

  return {
    tool: {
      name: `${prefix}_CALL_TOOL`,
      description: `Execute a tool by name. Use ${describeToolName} first to understand the input schema.`,
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
              text: `Tool not found: ${innerName}. Use ${searchToolName} to find available tools.`,
            },
          ],
          isError: true,
        };
      }

      return toolContext.callTool(innerName, innerArgs);
    },
  };
}

/**
 * Create a run code tool with configurable name prefix
 *
 * @param toolContext - Tool context with tools and callTool function
 * @param prefix - Name prefix ("GATEWAY" or "CODE_EXECUTION")
 * @param filterTools - Whether to filter out CODE_EXECUTION_* tools (for gateway deduplication)
 */
export function createRunCodeToolHandler(
  toolContext: ToolContext,
  prefix: ToolNamePrefix,
  filterTools = false,
): ToolWithHandler {
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

  // Optionally filter out CODE_EXECUTION_* tools to avoid duplication
  const filteredTools = filterTools
    ? filterCodeExecutionTools(toolContext.tools)
    : toolContext.tools;

  const describeToolName =
    prefix === "GATEWAY"
      ? "GATEWAY_DESCRIBE_TOOLS"
      : "CODE_EXECUTION_DESCRIBE_TOOLS";

  return {
    tool: {
      name: `${prefix}_RUN_CODE`,
      description: `Run JavaScript code in a sandbox. Code must be an ES module that \`export default\`s an async function that receives (tools) as its first parameter. Use ${describeToolName} to understand the input/output schemas for a tool before calling it. Use \`await tools.toolName(args)\` or \`await tools["tool-name"](args)\` to call tools.`,
      inputSchema: z.toJSONSchema(inputSchema) as Tool["inputSchema"],
    },
    handler: async (args) => {
      const parsed = inputSchema.safeParse(args);
      if (!parsed.success) {
        return jsonError({ error: parsed.error.flatten() });
      }

      // Create tool context with filtered tools
      const filteredContext: ToolContext = {
        ...toolContext,
        tools: filteredTools,
      };

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

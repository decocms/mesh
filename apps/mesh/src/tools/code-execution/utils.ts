/**
 * CODE_EXECUTION Shared Utilities
 *
 * Core reusable logic for code execution tools and gateway strategies.
 * Used by both:
 * - Management MCP tools (CODE_EXECUTION_*)
 * - Gateway query string strategy (?mode=code_execution)
 */

import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { MeshContext } from "../../core/mesh-context";
import { requireOrganization } from "../../core/mesh-context";
import { ProxyCollection } from "../../gateway/proxy-collection";
import type { ToolSelectionMode } from "../../storage/types";
import { runCode, type RunCodeResult } from "../../sandbox/index";
import type { ConnectionEntity } from "../connection/schema";
import type { GatewayEntity } from "../gateway/schema";
import type { ToolEntity } from "../tool/schema";

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

const STORED_TOOL_CONNECTION_ID = "stored-tools";
const STORED_TOOL_CONNECTION_TITLE = "Stored Tools";
const STORED_TOOL_TIMEOUT_MS = 3000;

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
export interface ToolDescription {
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

function resolveStoredToolIds(
  initialIds: string[],
  toolById: Map<string, ToolEntity>,
): string[] {
  const resolved = new Set<string>();
  const queue = [...initialIds];

  while (queue.length > 0) {
    const nextId = queue.shift();
    if (!nextId || resolved.has(nextId)) continue;
    const tool = toolById.get(nextId);
    if (!tool) continue;
    resolved.add(nextId);
    for (const depId of tool.dependencies ?? []) {
      if (!resolved.has(depId)) queue.push(depId);
    }
  }

  return Array.from(resolved);
}

async function loadStoredTools(
  ctx: MeshContext,
  gateway?: GatewayEntity | null,
): Promise<ToolEntity[]> {
  const organization = requireOrganization(ctx);
  const allTools = await ctx.storage.tools.list(organization.id);
  const toolById = new Map(allTools.map((tool) => [tool.id, tool]));

  const baseIds =
    gateway?.saved_tools && gateway.saved_tools.length > 0
      ? gateway.saved_tools
      : allTools.map((tool) => tool.id);

  const resolvedIds = resolveStoredToolIds(baseIds, toolById);
  return resolvedIds
    .map((id) => toolById.get(id))
    .filter((tool): tool is ToolEntity => tool !== undefined);
}

function toStoredToolDefinition(tool: ToolEntity): ToolWithConnection {
  return {
    name: tool.name,
    description: tool.description ?? undefined,
    inputSchema: tool.input_schema,
    outputSchema: tool.output_schema ?? undefined,
    _meta: {
      connectionId: STORED_TOOL_CONNECTION_ID,
      connectionTitle: STORED_TOOL_CONNECTION_TITLE,
    },
  };
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
  options: { excludeConnectionIds?: string[] } = {},
): Promise<ToolContext> {
  const organization = requireOrganization(ctx);

  let connections: ConnectionWithSelection[];
  let selectionMode: ToolSelectionMode = "inclusion";
  let gateway: GatewayEntity | null = null;

  if (ctx.gatewayId) {
    // Use gateway-specific connections
    gateway = await ctx.storage.gateways.findById(ctx.gatewayId);
    if (!gateway) {
      throw new Error(`Gateway not found: ${ctx.gatewayId}`);
    }
    connections = await resolveGatewayConnections(gateway, ctx);
    selectionMode = gateway.tool_selection_mode;
  } else {
    // Use ALL active org connections
    connections = await getAllOrgConnections(organization.id, ctx);
  }

  if (options.excludeConnectionIds && options.excludeConnectionIds.length > 0) {
    const excludeSet = new Set(options.excludeConnectionIds);
    connections = connections.filter(
      (entry) => !excludeSet.has(entry.connection.id),
    );
  }

  const baseContext = await loadToolsFromConnections(
    connections,
    selectionMode,
    ctx,
  );

  const storedTools = await loadStoredTools(ctx, gateway);
  if (storedTools.length === 0) {
    return baseContext;
  }

  const storedToolMap = new Map(storedTools.map((tool) => [tool.name, tool]));
  const mergedTools = [...baseContext.tools];
  const seen = new Set(baseContext.tools.map((tool) => tool.name));

  for (const tool of storedTools) {
    if (seen.has(tool.name)) continue;
    mergedTools.push(toStoredToolDefinition(tool));
    seen.add(tool.name);
  }

  const categories = Array.from(
    new Set([...baseContext.categories, STORED_TOOL_CONNECTION_TITLE]),
  ).sort();

  const callTool = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> => {
    const storedTool = storedToolMap.get(name);
    if (storedTool) {
      const result = await runCodeWithTools(
        storedTool.execute,
        { tools: mergedTools, callTool, categories },
        STORED_TOOL_TIMEOUT_MS,
        { input: args },
      );

      if (result.error) {
        return jsonError(result);
      }

      return jsonResult({
        returnValue: result.returnValue,
        consoleLogs: result.consoleLogs,
      });
    }

    return baseContext.callTool(name, args);
  };

  return {
    tools: mergedTools,
    callTool,
    categories,
  };
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
export function searchTools(
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
export function describeTools(
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
export async function runCodeWithTools(
  code: string,
  toolContext: ToolContext,
  timeoutMs: number,
  globals?: Record<string, unknown>,
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
    globals,
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a JSON result for tool output
 */
export function jsonResult(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Create a JSON error result for tool output
 */
export function jsonError(data: unknown): CallToolResult {
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
export function filterCodeExecutionTools(
  tools: ToolWithConnection[],
): ToolWithConnection[] {
  const excludeSet = new Set<string>(CODE_EXECUTION_TOOL_NAMES);
  return tools.filter((t) => !excludeSet.has(t.name));
}

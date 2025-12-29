/**
 * ToolGateway
 *
 * Lazy-loading gateway for aggregating tools from multiple connections
 */

import type {
  CallToolRequest,
  CallToolResult,
  ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import type {
  GatewayToolSelectionStrategy,
  ToolSelectionMode,
} from "../storage/types";
import { lazy } from "../common";
import { getStrategy, type ToolWithConnection } from "./strategy";
import type { ProxyCollection } from "./proxy-collection";

/** Maps tool name -> { connectionId, originalName } */
interface ToolMapping {
  connectionId: string;
  originalName: string;
}

/** Options for ToolGateway */
export interface ToolGatewayOptions {
  selectionMode: ToolSelectionMode;
  strategy: GatewayToolSelectionStrategy;
}

/** Cached data structure */
interface ToolCache {
  tools: ToolWithConnection[];
  mappings: Map<string, ToolMapping>;
  strategyResult: ReturnType<ReturnType<typeof getStrategy>>;
}

/**
 * Gateway for aggregating and routing tools from multiple connections
 *
 * Tools are loaded lazily on first access and cached for subsequent calls.
 * Uses lazy() to ensure concurrent calls share the same loading promise.
 */
export class ToolGateway {
  private cache: Promise<ToolCache>;

  constructor(
    private proxies: ProxyCollection,
    private options: ToolGatewayOptions,
  ) {
    // Create lazy cache - only loads when first awaited
    this.cache = lazy(() => this.loadTools());
  }

  /**
   * Load tools from all connections
   */
  private async loadTools(): Promise<ToolCache> {
    // Fetch tools from all connections in parallel
    const results = await this.proxies.mapSettled(
      async (entry, connectionId) => {
        try {
          const result = await entry.proxy.client.listTools();
          let tools = result.tools;

          // Apply selection based on mode
          if (this.options.selectionMode === "exclusion") {
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
            `[gateway] Failed to list tools for connection ${connectionId}:`,
            error,
          );
          return null;
        }
      },
    );

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
          metadata: { connectionId, connectionTitle },
        });
        mappings.set(tool.name, { connectionId, originalName: tool.name });
      }
    }

    // Create base callTool that routes to the correct connection
    const baseCallTool = async (
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

      const proxyEntry = this.proxies.get(mapping.connectionId);
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

    // Apply the strategy to transform tools
    const strategy = getStrategy(this.options.strategy);
    const strategyResult = strategy({
      tools: allTools,
      callTool: baseCallTool,
      categories: Array.from(categories).sort(),
    });

    return {
      tools: allTools,
      mappings,
      strategyResult,
    };
  }

  /**
   * List all aggregated tools
   */
  async list(): Promise<ListToolsResult> {
    const cache = await this.cache;
    return {
      tools: cache.strategyResult.tools.map(({ metadata: _, ...tool }) => tool),
    };
  }

  /**
   * Call a tool by name, routing to the correct connection
   */
  async call(params: CallToolRequest["params"]): Promise<CallToolResult> {
    const cache = await this.cache;
    return cache.strategyResult.callTool(
      params.name,
      params.arguments ?? {},
    ) as Promise<CallToolResult>;
  }

  /**
   * Call a tool with streaming support
   */
  async callStreamable(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Response> {
    const cache = await this.cache;

    // For direct tools, route to underlying proxy for streaming
    const mapping = cache.mappings.get(name);
    if (mapping) {
      const proxyEntry = this.proxies.get(mapping.connectionId);
      if (proxyEntry) {
        return proxyEntry.proxy.callStreamableTool(mapping.originalName, args);
      }
    }

    // Meta-tool or not found - execute through strategy and return JSON
    const result = await cache.strategyResult.callTool(name, args);
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }
}

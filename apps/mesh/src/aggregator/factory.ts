/**
 * Aggregator Factory
 *
 * Factory functions for creating MCP aggregators from Virtual MCP entities.
 * Shared between gateway routes and proxy routes for VIRTUAL connections.
 */

import type { MeshContext } from "../core/mesh-context";
import {
  type ConnectionEntity,
  parseVirtualUrl,
} from "../tools/connection/schema";
import type { VirtualMCPEntity } from "../tools/virtual-mcp/schema";

/**
 * Check if a connection would cause a self-reference for a Virtual MCP
 * (i.e., a VIRTUAL connection that references the same Virtual MCP)
 */
function isSelfReferencingVirtual(
  connection: ConnectionEntity,
  virtualMcpId: string,
): boolean {
  if (connection.connection_type !== "VIRTUAL") return false;
  const referencedVirtualMcpId = parseVirtualUrl(connection.connection_url);
  return referencedVirtualMcpId === virtualMcpId;
}
import { PromptAggregator } from "./prompt-aggregator";
import { ProxyCollection } from "./proxy-collection";
import { ResourceAggregator } from "./resource-aggregator";
import { ResourceTemplateAggregator } from "./resource-template-aggregator";
import { type AggregatorToolSelectionStrategy } from "./strategy";
import { ToolAggregator } from "./tool-aggregator";
import type { AggregatorClient, AggregatorOptions } from "./types";

/**
 * Create an MCP aggregator that aggregates tools, resources, and prompts from multiple connections
 *
 * Uses lazy-loading aggregators - data is only fetched from connections when first accessed.
 *
 * @param options - Aggregator configuration (connections with selected tools and strategy)
 * @param ctx - Mesh context for creating proxies
 * @returns AggregatorClient interface with aggregated tools, resources, and prompts
 */
export async function createMCPAggregator(
  options: AggregatorOptions,
  ctx: MeshContext,
): Promise<AggregatorClient> {
  // Create proxy collection for all connections
  const proxies = await ProxyCollection.create(options.connections, ctx);

  // Create lazy aggregator abstractions
  const tools = new ToolAggregator(proxies, {
    selectionMode: options.toolSelectionMode,
    strategy: options.toolSelectionStrategy,
  });
  const resources = new ResourceAggregator(proxies, {
    selectionMode: options.toolSelectionMode,
  });
  const resourceTemplates = new ResourceTemplateAggregator(proxies);
  const prompts = new PromptAggregator(proxies, {
    selectionMode: options.toolSelectionMode,
  });

  return {
    client: {
      listTools: tools.list.bind(tools),
      callTool: tools.call.bind(tools),
      listResources: resources.list.bind(resources),
      readResource: resources.read.bind(resources),
      listResourceTemplates: resourceTemplates.list.bind(resourceTemplates),
      listPrompts: prompts.list.bind(prompts),
      getPrompt: prompts.get.bind(prompts),
    },
    callStreamableTool: tools.callStreamable.bind(tools),
  };
}

/**
 * Load virtual MCP entity and create MCP aggregator
 * Handles inclusion/exclusion modes and smart_tool_selection strategy
 *
 * @param virtualMcp - Virtual MCP entity from database
 * @param ctx - Mesh context for creating proxies
 * @param strategy - Tool selection strategy (passthrough, smart_tool_selection, code_execution)
 * @returns AggregatorClient interface with aggregated tools, resources, and prompts
 */
export async function createMCPAggregatorFromEntity(
  virtualMcp: VirtualMCPEntity,
  ctx: MeshContext,
  strategy: AggregatorToolSelectionStrategy,
): Promise<AggregatorClient> {
  let connections: Array<{
    connection: ConnectionEntity;
    selectedTools: string[] | null;
    selectedResources: string[] | null;
    selectedPrompts: string[] | null;
  }>;

  if (virtualMcp.tool_selection_mode === "exclusion") {
    // Exclusion mode: list ALL org connections, then apply exclusion filter
    const allConnections = await ctx.storage.connections.list(
      virtualMcp.organization_id,
    );
    // Filter out inactive connections and self-referencing VIRTUAL connections
    const activeConnections = allConnections.filter(
      (c) =>
        c.status === "active" && !isSelfReferencingVirtual(c, virtualMcp.id),
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
    for (const vmConn of virtualMcp.connections) {
      exclusionMap.set(vmConn.connection_id, {
        selectedTools: vmConn.selected_tools,
        selectedResources: vmConn.selected_resources,
        selectedPrompts: vmConn.selected_prompts,
      });
    }

    connections = [];
    for (const conn of activeConnections) {
      const exclusionEntry = exclusionMap.get(conn.id);

      if (exclusionEntry === undefined) {
        // Connection NOT in virtualMcp.connections -> include all
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
        // Connection in virtualMcp.connections with all null/empty -> exclude entire connection
        // Skip this connection
      } else {
        // Connection in virtualMcp.connections with specific exclusions
        connections.push({
          connection: conn,
          selectedTools: exclusionEntry.selectedTools,
          selectedResources: exclusionEntry.selectedResources,
          selectedPrompts: exclusionEntry.selectedPrompts,
        });
      }
    }
  } else {
    // Inclusion mode (default): use only the connections specified in virtual MCP
    const connectionIds = virtualMcp.connections.map((c) => c.connection_id);
    const loadedConnections: ConnectionEntity[] = [];

    for (const connId of connectionIds) {
      const conn = await ctx.storage.connections.findById(connId);
      // Skip inactive connections and self-referencing VIRTUAL connections
      if (
        conn &&
        conn.status === "active" &&
        !isSelfReferencingVirtual(conn, virtualMcp.id)
      ) {
        loadedConnections.push(conn);
      }
    }

    connections = loadedConnections.map((conn) => {
      const vmConn = virtualMcp.connections.find(
        (c) => c.connection_id === conn.id,
      );
      return {
        connection: conn,
        selectedTools: vmConn?.selected_tools ?? null,
        selectedResources: vmConn?.selected_resources ?? null,
        selectedPrompts: vmConn?.selected_prompts ?? null,
      };
    });
  }

  // Build aggregator options with strategy
  const options: AggregatorOptions = {
    connections,
    toolSelectionMode: virtualMcp.tool_selection_mode,
    toolSelectionStrategy: strategy,
  };

  return createMCPAggregator(options, ctx);
}

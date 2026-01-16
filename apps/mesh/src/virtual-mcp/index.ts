/**
 * Virtual MCP Module
 *
 * Provides factory functions for creating Virtual MCPs that aggregate
 * tools, resources, and prompts from multiple connections.
 *
 * Virtual MCPs can be:
 * 1. Database-backed: Defined in the virtual_mcps table
 * 2. Well-known: Predefined configurations (e.g., Decopilot)
 */

import type { MeshContext } from "../core/mesh-context";
import {
  PromptGateway,
  ProxyCollection,
  ResourceGateway,
  ResourceTemplateGateway,
  ToolGateway,
  type GatewayClient,
  type GatewayOptions,
} from "../gateway";
import {
  parseStrategyFromMode,
  type GatewayToolSelectionStrategy,
} from "../gateway/strategy";
import type { VirtualMCPEntity } from "../tools/virtual-mcp/schema";
import type { ConnectionEntity } from "../tools/connection/schema";

// Re-export types
export type { GatewayClient, GatewayOptions } from "../gateway";
export type { GatewayToolSelectionStrategy } from "../gateway/strategy";

/**
 * Create a Virtual MCP client that aggregates tools, resources, and prompts
 *
 * Uses lazy-loading - data is only fetched from connections when first accessed.
 *
 * @param options - Virtual MCP configuration (connections with selected tools and strategy)
 * @param ctx - Mesh context for creating proxies
 * @returns GatewayClient interface with aggregated tools, resources, and prompts
 */
export async function createVirtualMCP(
  options: GatewayOptions,
  ctx: MeshContext,
): Promise<GatewayClient> {
  // Create proxy collection for all connections
  const proxies = await ProxyCollection.create(options.connections, ctx);

  // Create lazy gateway abstractions
  const tools = new ToolGateway(proxies, {
    selectionMode: options.toolSelectionMode,
    strategy: options.toolSelectionStrategy,
  });
  const resources = new ResourceGateway(proxies, {
    selectionMode: options.toolSelectionMode,
  });
  const resourceTemplates = new ResourceTemplateGateway(proxies);
  const prompts = new PromptGateway(proxies, {
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
 * Create a Virtual MCP client from a database entity
 *
 * Handles inclusion/exclusion modes and tool selection strategy.
 *
 * @param virtualMcp - Virtual MCP entity from database
 * @param ctx - Mesh context for creating proxies
 * @param strategy - Tool selection strategy (passthrough, smart, etc.)
 * @returns GatewayClient interface with aggregated tools, resources, and prompts
 */
export async function createVirtualMCPFromEntity(
  virtualMcp: VirtualMCPEntity,
  ctx: MeshContext,
  strategy: GatewayToolSelectionStrategy,
): Promise<GatewayClient> {
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
    const activeConnections = allConnections.filter(
      (c) => c.status === "active" && c.connection_type !== "virtual",
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
    for (const vmcpConn of virtualMcp.connections) {
      exclusionMap.set(vmcpConn.connection_id, {
        selectedTools: vmcpConn.selected_tools,
        selectedResources: vmcpConn.selected_resources,
        selectedPrompts: vmcpConn.selected_prompts,
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
      if (conn && conn.status === "active") {
        loadedConnections.push(conn);
      }
    }

    connections = loadedConnections.map((conn) => {
      const vmcpConn = virtualMcp.connections.find(
        (c) => c.connection_id === conn.id,
      );
      return {
        connection: conn,
        selectedTools: vmcpConn?.selected_tools ?? null,
        selectedResources: vmcpConn?.selected_resources ?? null,
        selectedPrompts: vmcpConn?.selected_prompts ?? null,
      };
    });
  }

  // Build gateway options with strategy
  const options: GatewayOptions = {
    connections,
    toolSelectionMode: virtualMcp.tool_selection_mode,
    toolSelectionStrategy: strategy,
  };

  return createVirtualMCP(options, ctx);
}

/**
 * Create a Virtual MCP client from a virtual MCP ID
 *
 * Looks up the virtual MCP from storage and creates the client.
 *
 * @param virtualMcpId - Virtual MCP ID
 * @param ctx - Mesh context for creating proxies
 * @param mode - Optional mode query string for strategy selection
 * @returns GatewayClient interface with aggregated tools, resources, and prompts
 */
export async function createVirtualMCPFromId(
  virtualMcpId: string,
  ctx: MeshContext,
  mode?: string,
): Promise<GatewayClient | null> {
  const virtualMcp = await ctx.storage.virtualMcps.findById(virtualMcpId);
  if (!virtualMcp) {
    return null;
  }

  if (virtualMcp.status !== "active") {
    throw new Error(`Virtual MCP is inactive: ${virtualMcpId}`);
  }

  const strategy = parseStrategyFromMode(mode);
  return createVirtualMCPFromEntity(virtualMcp, ctx, strategy);
}

// Backward compatibility aliases
/** @deprecated Use createVirtualMCP instead */
export const createMCPGateway = createVirtualMCP;
/** @deprecated Use createVirtualMCPFromEntity instead */
export const createMCPGatewayFromEntity = createVirtualMCPFromEntity;

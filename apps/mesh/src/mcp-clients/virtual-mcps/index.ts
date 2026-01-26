/**
 * Virtual MCP Abstractions
 *
 * Lazy-loading virtual MCPs for aggregating MCP resources from multiple connections
 */

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { MeshContext } from "../../core/mesh-context";
import {
  type ConnectionEntity,
  parseVirtualUrl,
} from "../../tools/connection/schema";
import type { VirtualMCPEntity } from "../../tools/virtual-mcp/schema";
import {
  VirtualMCPPassthroughClient,
  VirtualMCPSmartToolClient,
  VirtualMCPCodeExecutionClient,
} from "./virtual-mcp-client";
import type { VirtualMCPConnectionEntry, VirtualMCPOptions } from "./types";

export type { ToolWithConnection } from "../../tools/code-execution/utils";
export type {
  VirtualMCPConnectionEntry,
  VirtualMCPOptions,
  VirtualMCPToolSelectionStrategy,
} from "./types";
export {
  createVirtualConnectionClient,
  type CreateVirtualConnectionClientOptions,
} from "./virtual-connection-client";

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

async function createConnectionEntries(
  connections: VirtualMCPOptions["connections"],
  ctx: MeshContext,
): Promise<VirtualMCPConnectionEntry[]> {
  const results = await Promise.allSettled(
    connections.map(
      async ({
        connection,
        selectedTools,
        selectedResources,
        selectedPrompts,
      }) => {
        try {
          const proxy = await ctx.createMCPProxy(connection);
          return {
            client: proxy.client,
            callStreamableTool: proxy.callStreamableTool,
            connection,
            selectedTools,
            selectedResources,
            selectedPrompts,
          };
        } catch (error) {
          console.error(
            `[virtual-mcp] Failed to create client for connection ${connection.id}:`,
            error,
          );
          return null;
        }
      },
    ),
  );

  return results.flatMap((result) => {
    if (result.status !== "fulfilled" || !result.value) {
      return [];
    }
    return [result.value];
  });
}

/**
 * Create a virtual MCP that aggregates tools, resources, and prompts from multiple connections
 *
 * Uses lazy-loading aggregators - data is only fetched from connections when first accessed.
 *
 * @param options - Virtual MCP configuration (connections with selected tools and strategy)
 * @param ctx - Mesh context for creating proxies
 * @returns Aggregated client with aggregated tools, resources, and prompts
 */
async function createVirtualMCP(
  options: VirtualMCPOptions,
  ctx: MeshContext,
): Promise<Client> {
  const entries = await createConnectionEntries(options.connections, ctx);

  // Create the appropriate client based on strategy
  switch (options.toolSelectionStrategy) {
    case "smart_tool_selection":
      return new VirtualMCPSmartToolClient(entries);
    case "code_execution":
      return new VirtualMCPCodeExecutionClient(entries);
    case "passthrough":
    default:
      return new VirtualMCPPassthroughClient(entries);
  }
}

/**
 * Load virtual MCP entity and create virtual MCP client
 * Uses inclusion mode only - connections are always built from the virtual MCP's explicit list
 *
 * @param virtualMcp - Virtual MCP entity from database
 * @param ctx - Mesh context for creating proxies
 * @param strategy - Tool selection strategy (passthrough, smart_tool_selection, code_execution)
 * @returns Aggregated client with aggregated tools, resources, and prompts
 */
export async function createVirtualMCPFromEntity(
  virtualMcp: VirtualMCPEntity,
  ctx: MeshContext,
  strategy: "passthrough" | "smart_tool_selection" | "code_execution",
): Promise<Client> {
  // Inclusion mode: use only the connections specified in virtual MCP
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

  const connections = loadedConnections.map((conn) => {
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

  // Build virtual MCP options with strategy
  const options: VirtualMCPOptions = {
    connections,
    toolSelectionStrategy: strategy,
  };

  return createVirtualMCP(options, ctx);
}

/**
 * Parse strategy from mode query parameter
 */
export function parseStrategyFromMode(
  mode: string | undefined,
): "passthrough" | "smart_tool_selection" | "code_execution" {
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

/**
 * Virtual MCP Client Factory
 *
 * Factory functions for creating MCP clients from Virtual MCP entities.
 * Shared between Virtual MCP routes and proxy routes for VIRTUAL connections.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { MeshContext } from "../../core/mesh-context";
import {
  type ConnectionEntity,
  parseVirtualUrl,
} from "../../tools/connection/schema";
import type { VirtualMCPEntity } from "../../tools/virtual-mcp/schema";
import { CodeExecutionClient } from "./code-execution";
import { PassthroughClient } from "./passthrough-client";
import { SmartToolSelectionClient } from "./smart-tool-selection";
import type {
  AggregatorOptions,
  AggregatorToolSelectionStrategy,
} from "./types";

/** Client type that supports async disposal */
export type VirtualMCPClient = Client & {
  [Symbol.asyncDispose]: () => Promise<void>;
};

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

/**
 * Create an MCP client that aggregates tools, resources, and prompts from multiple connections
 *
 * Uses lazy-loading - data is only fetched from connections when first accessed.
 *
 * @param options - Aggregator configuration (connections, selected data, and strategy)
 * @param ctx - Mesh context for creating proxies
 * @returns Client instance with aggregated tools, resources, and prompts
 */
async function createMCPAggregator(
  options: AggregatorOptions,
  ctx: MeshContext,
): Promise<VirtualMCPClient> {
  // Create the appropriate client based on strategy
  switch (options.strategy) {
    case "smart_tool_selection":
      return new SmartToolSelectionClient(options, ctx) as VirtualMCPClient;
    case "code_execution":
      return new CodeExecutionClient(options, ctx) as VirtualMCPClient;
    case "passthrough":
    default:
      return new PassthroughClient(options, ctx) as VirtualMCPClient;
  }
}

/**
 * Load virtual MCP entity and create MCP client
 * Uses inclusion mode: only connections specified in virtualMcp.connections are included
 *
 * @param virtualMcp - Virtual MCP entity from database
 * @param ctx - Mesh context for creating proxies
 * @param strategy - Tool selection strategy (passthrough, smart_tool_selection, code_execution)
 * @returns Client instance with aggregated tools, resources, and prompts
 */
export async function createMCPAggregatorFromEntity(
  virtualMcp: VirtualMCPEntity,
  ctx: MeshContext,
  strategy: AggregatorToolSelectionStrategy,
): Promise<VirtualMCPClient> {
  // Inclusion mode: use only the connections specified in virtual MCP
  const connectionIds = virtualMcp.connections.map((c) => c.connection_id);

  // Load all connections in parallel
  const connectionPromises = connectionIds.map((connId) =>
    ctx.storage.connections.findById(connId),
  );
  const allConnections = await Promise.all(connectionPromises);

  // Filter out inactive connections and self-referencing VIRTUAL connections
  const loadedConnections = allConnections.filter(
    (conn): conn is ConnectionEntity =>
      conn !== null &&
      conn.status === "active" &&
      !isSelfReferencingVirtual(conn, virtualMcp.id),
  );

  // Build aggregator options with strategy
  const options: AggregatorOptions = {
    connections: loadedConnections,
    selected: virtualMcp.connections,
    strategy,
  };

  return createMCPAggregator(options, ctx);
}

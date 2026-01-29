/**
 * MCP Client Factory
 *
 * Top-level factory for creating MCP clients from connection entities.
 * Routes to appropriate factory based on connection type.
 */

import type { MeshContext } from "@/core/mesh-context";
import type { ConnectionEntity } from "@/tools/connection/schema";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createOutboundClient } from "./outbound";
import { createVirtualClient, type ToolSelectionStrategy } from "./virtual-mcp";

/**
 * Create an MCP client from a connection entity
 *
 * Routes to the appropriate factory based on connection type:
 * - VIRTUAL: Creates a virtual MCP aggregator client
 * - STDIO, HTTP, Websocket, SSE: Creates an outbound client
 *
 * @param connection - Connection entity from database
 * @param ctx - Mesh context for creating clients
 * @param options - Options object with superUser flag and optional strategy
 * @returns Client instance connected to the MCP server
 */
export async function createClient(
  connection: ConnectionEntity,
  ctx: MeshContext,
  options: { superUser?: boolean; strategy?: ToolSelectionStrategy } = {},
): Promise<Client> {
  const { superUser = false, strategy = "passthrough" } = options;
  if (connection.connection_type === "VIRTUAL") {
    return createVirtualClient(connection, ctx, strategy);
  }
  return createOutboundClient(connection, ctx, superUser);
}

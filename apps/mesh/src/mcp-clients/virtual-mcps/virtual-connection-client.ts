/**
 * Virtual Connection Client Factory
 *
 * Factory for creating MCP clients for VIRTUAL connection types
 */

import {
  createInMemoryTransportPair,
  createMcpServerBridge,
} from "@decocms/mesh-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { MeshContext } from "../../core/mesh-context";
import {
  parseVirtualUrl,
  type ConnectionEntity,
} from "../../tools/connection/schema";
import { createVirtualMCPFromEntity } from "./index";
import type { DisposableClient } from "../outbound/client-factory";

/**
 * Options for creating a virtual connection client
 */
export interface CreateVirtualConnectionClientOptions {
  connection: ConnectionEntity;
  connectionId: string;
  ctx: MeshContext;
}

/**
 * Create client for VIRTUAL connection type
 *
 * This bridges a virtual MCP (which aggregates multiple connections) to an MCP client
 * using an in-memory transport pair.
 */
export async function createVirtualConnectionClient(
  options: CreateVirtualConnectionClientOptions,
): Promise<DisposableClient> {
  const { connection, connectionId, ctx } = options;

  // Parse virtual MCP ID from URL: virtual://$id
  const virtualMcpId = parseVirtualUrl(connection.connection_url);
  if (!virtualMcpId) {
    throw new Error(
      "VIRTUAL connection missing virtual MCP ID in connection_url",
    );
  }

  // Load virtual MCP entity
  const virtualMcp = await ctx.storage.virtualMcps.findById(virtualMcpId);
  if (!virtualMcp) {
    throw new Error(`Virtual MCP not found: ${virtualMcpId}`);
  }

  // Create virtual MCP client from entity
  const virtualMcpClient = await createVirtualMCPFromEntity(
    virtualMcp,
    ctx,
    "passthrough",
  );

  // Bridge client to MCP server
  const server = createMcpServerBridge(virtualMcpClient, {
    name: `mcp-virtual-mcp-${virtualMcp.title}`,
    version: "1.0.0",
    instructions: virtualMcp.metadata?.instructions,
  });

  const { client: clientTransport, server: serverTransport } =
    createInMemoryTransportPair();
  await server.connect(serverTransport);

  const virtualClient = new Client({
    name: `mcp-virtual-mcp-client-${virtualMcp.title}`,
    version: "1.0.0",
  });
  await virtualClient.connect(clientTransport);

  const disposable = virtualClient as DisposableClient;
  disposable[Symbol.dispose] = async () => {
    try {
      await clientTransport.close?.();
    } catch (error) {
      console.error(
        `[VirtualConnectionClient] Error closing client transport for ${connectionId}:`,
        error,
      );
    }
    try {
      await serverTransport.close();
    } catch (error) {
      console.error(
        `[VirtualConnectionClient] Error closing server transport for ${connectionId}:`,
        error,
      );
    }
    try {
      await server.close();
    } catch (error) {
      console.error(
        `[VirtualConnectionClient] Error closing server for ${connectionId}:`,
        error,
      );
    }
    try {
      await virtualClient.close();
    } catch (error) {
      console.error(
        `[VirtualConnectionClient] Error closing virtual client for ${connectionId}:`,
        error,
      );
    }
  };
  return disposable;
}

/**
 * MCP Clients
 *
 * Public exports for MCP client management
 */

import type { MeshContext } from "../core/mesh-context";
import type {
  ConnectionEntity,
  HttpConnectionParameters,
  StdioConnectionParameters,
} from "../tools/connection/schema";
import {
  createOutboundClient,
  type CreateOutboundClientOptions,
  type DisposableClient,
} from "./outbound";
import {
  createVirtualConnectionClient,
  type CreateVirtualConnectionClientOptions,
} from "./virtual-mcps";

export * from "./virtual-mcps";
export * from "./outbound";

/**
 * Unified options for creating a client by connection type
 */
export interface CreateClientByConnectionTypeOptions {
  connection: ConnectionEntity;
  connectionId: string;
  stdioParams: StdioConnectionParameters | null;
  httpParams: HttpConnectionParameters | null;
  bypassAuth: boolean;
  ctx: MeshContext;
}

/**
 * Create client by connection type
 *
 * Routes to the appropriate client factory based on connection.connection_type:
 * - VIRTUAL → createVirtualConnectionClient
 * - HTTP, SSE, Websocket, STDIO → createOutboundClient
 */
export async function createClientByConnectionType(
  options: CreateClientByConnectionTypeOptions,
): Promise<DisposableClient> {
  const { connection } = options;

  if (connection.connection_type === "VIRTUAL") {
    const virtualOptions: CreateVirtualConnectionClientOptions = {
      connection: options.connection,
      connectionId: options.connectionId,
      ctx: options.ctx,
    };
    return createVirtualConnectionClient(virtualOptions);
  }

  const outboundOptions: CreateOutboundClientOptions = {
    connection: options.connection,
    connectionId: options.connectionId,
    stdioParams: options.stdioParams,
    httpParams: options.httpParams,
    bypassAuth: options.bypassAuth,
    ctx: options.ctx,
  };
  return createOutboundClient(outboundOptions);
}

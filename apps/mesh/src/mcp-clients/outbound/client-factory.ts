/**
 * Outbound MCP Client Factory
 *
 * Factory for creating MCP clients for outbound connections (HTTP, SSE, STDIO)
 */

import {
  Client,
  type ClientOptions,
} from "@modelcontextprotocol/sdk/client/index.js";
import type { Implementation } from "@modelcontextprotocol/sdk/types.js";
import type { MeshContext } from "../../core/mesh-context";
import {
  type ConnectionEntity,
  type HttpConnectionParameters,
  type StdioConnectionParameters,
} from "../../tools/connection/schema";
import { createTransportForConnection } from "./network-transport";
import { getStableStdioClient } from "./stdio-transport";

/**
 * A client that can be disposed using Symbol.dispose
 * Overrides connect to capture the transport for cleanup
 */
export class DisposableClient extends Client {
  constructor(clientInfo: Implementation, options?: ClientOptions) {
    super(clientInfo, options);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    try {
      await this.transport?.close?.();
    } catch (error) {
      console.error("[ClientFactory] Error closing transport:", error);
    }
    try {
      await this.close();
    } catch (error) {
      console.error("[ClientFactory] Error closing client:", error);
    }
  }
}

/**
 * Options for creating an outbound client
 */
export interface CreateOutboundClientOptions {
  connection: ConnectionEntity;
  connectionId: string;
  stdioParams: StdioConnectionParameters | null;
  httpParams: HttpConnectionParameters | null;
  bypassAuth: boolean;
  ctx: MeshContext;
}

/**
 * Create client factory for downstream MCP based on connection_type
 */
export async function createOutboundClient(
  options: CreateOutboundClientOptions,
): Promise<DisposableClient> {
  const { connection, connectionId, stdioParams, httpParams, bypassAuth, ctx } =
    options;

  // Create disposable client once at the beginning
  const client = new DisposableClient(
    { name: "mcp-mesh-proxy", version: "1.0.0" },
    {
      capabilities: {
        tasks: {
          list: {},
          cancel: {},
          requests: { tool: { call: {} } },
        },
      },
    },
  );

  // For STDIO, use stable transport (manages process lifecycle)
  if (connection.connection_type === "STDIO") {
    // Block STDIO connections in production unless explicitly allowed
    if (
      process.env.NODE_ENV === "production" &&
      process.env.UNSAFE_ALLOW_STDIO_TRANSPORT !== "true"
    ) {
      throw new Error(
        "STDIO connections are disabled in production. Set UNSAFE_ALLOW_STDIO_TRANSPORT=true to enable.",
      );
    }

    if (!stdioParams) {
      throw new Error("STDIO connection missing parameters");
    }

    // Get or create stable connection - respawns automatically if closed
    // We want stable local MCP connection - don't spawn new process per request
    const stableClient = await getStableStdioClient(
      {
        id: connectionId,
        name: connection.title,
        command: stdioParams.command,
        args: stdioParams.args,
        env: stdioParams.envVars,
        cwd: stdioParams.cwd,
      },
      client,
    );

    // For STDIO, copy all properties from stableClient to disposableClient
    // The stable client's close() is disabled, so we'll handle cleanup via dispose
    Object.setPrototypeOf(client, Object.getPrototypeOf(stableClient));
    Object.assign(client, stableClient);
    // Restore the dispose method and update it to close the actual client
    (client as { [Symbol.asyncDispose]: () => Promise<void> })[
      Symbol.asyncDispose
    ] = async () => {
      // For STDIO, close the actual client (stable client has close disabled)
      const actualClient = (stableClient as { __actualClient?: Client })
        .__actualClient;
      if (actualClient) {
        try {
          await actualClient.close();
        } catch (error) {
          console.error(
            `[ClientFactory] Error closing STDIO client for ${connectionId}:`,
            error,
          );
        }
      }
    };

    return client;
  }

  // For HTTP/SSE/Websocket, create fresh client
  if (
    connection.connection_type === "HTTP" ||
    connection.connection_type === "Websocket" ||
    connection.connection_type === "SSE"
  ) {
    const transport = await createTransportForConnection({
      connection,
      httpParams,
      ctx,
      bypassAuth,
    });
    await client.connect(transport);

    return client;
  }

  // VIRTUAL connections should use createVirtualConnectionClient
  if (connection.connection_type === "VIRTUAL") {
    throw new Error(
      "Use createVirtualConnectionClient for VIRTUAL connections",
    );
  }

  throw new Error(`Unknown connection type: ${connection.connection_type}`);
}

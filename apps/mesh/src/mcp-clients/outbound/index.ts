/**
 * Outbound MCP Client Factory
 *
 * Factory functions for creating MCP clients for outbound connections
 * (STDIO, HTTP, Websocket, SSE).
 */

import type { MeshContext } from "@/core/mesh-context";
import {
  type ConnectionEntity,
  isStdioParameters,
} from "@/tools/connection/schema";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { buildRequestHeaders } from "./headers";
import { createStdioTransport } from "./transport-stdio";

/**
 * Create an MCP client for outbound connections (STDIO, HTTP, Websocket, SSE)
 *
 * @param connection - Connection entity from database
 * @param ctx - Mesh context for creating clients
 * @param superUser - Whether to use superuser mode for background processes
 * @returns Client instance connected to the downstream MCP server
 */
export async function createOutboundClient(
  connection: ConnectionEntity,
  ctx: MeshContext,
  superUser = false,
): Promise<Client> {
  const connectionId = connection.id;
  switch (connection.connection_type) {
    case "STDIO": {
      // Block STDIO connections in production unless explicitly allowed
      if (
        process.env.NODE_ENV === "production" &&
        process.env.UNSAFE_ALLOW_STDIO_TRANSPORT !== "true"
      ) {
        throw new Error(
          "STDIO connections are disabled in production. Set UNSAFE_ALLOW_STDIO_TRANSPORT=true to enable.",
        );
      }

      const maybeParams = connection.connection_headers;

      if (!isStdioParameters(maybeParams)) {
        throw new Error("STDIO connection missing parameters");
      }

      // Create transport with stderr logging
      const transport = createStdioTransport({
        id: connectionId,
        name: connection.title,
        command: maybeParams.command,
        args: maybeParams.args,
        env: maybeParams.envVars,
        cwd: maybeParams.cwd,
      });

      // Get or create client from LRU pool - automatically removed when connection closes
      return ctx.getOrCreateClient(transport, connectionId);
    }

    case "HTTP":
    case "Websocket": {
      if (!connection.connection_url) {
        throw new Error(`${connection.connection_type} connection missing URL`);
      }

      const headers = await buildRequestHeaders(connection, ctx, superUser);

      const httpParams = connection.connection_headers;
      if (httpParams && "headers" in httpParams) {
        Object.assign(headers, httpParams.headers);
      }

      const transport = new StreamableHTTPClientTransport(
        new URL(connection.connection_url),
        { requestInit: { headers } },
      );

      return ctx.getOrCreateClient(transport, connectionId);
    }

    case "SSE": {
      if (!connection.connection_url) {
        throw new Error("SSE connection missing URL");
      }

      const headers = await buildRequestHeaders(connection, ctx, superUser);

      const httpParams = connection.connection_headers;
      if (httpParams && "headers" in httpParams) {
        Object.assign(headers, httpParams.headers);
      }

      const transport = new SSEClientTransport(
        new URL(connection.connection_url),
        { requestInit: { headers } },
      );

      return ctx.getOrCreateClient(transport, connectionId);
    }

    default:
      throw new Error(`Unknown connection type: ${connection.connection_type}`);
  }
}

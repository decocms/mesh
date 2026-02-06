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
 * Shared mutable headers objects per connectionId.
 *
 * HTTP/SSE transports bake `requestInit.headers` into the transport at creation time,
 * but the MCP SDK reads headers BY REFERENCE at send time (`new Headers(this._requestInit?.headers)`).
 *
 * By sharing a single mutable headers object per connectionId, we can:
 * 1. Keep the client pool (avoid repeated initialize handshakes)
 * 2. Update auth headers (x-mesh-token JWT, Authorization) in-place before each use
 * 3. The cached transport picks up fresh values on the next send
 */
const sharedHeaders = new Map<string, Record<string, string>>();

/**
 * Get or create a shared mutable headers object for a connectionId,
 * then update it in-place with fresh auth headers.
 */
function refreshSharedHeaders(
  connectionId: string,
  freshHeaders: Record<string, string>,
): Record<string, string> {
  let headers = sharedHeaders.get(connectionId);
  if (!headers) {
    headers = {};
    sharedHeaders.set(connectionId, headers);
  }

  // Clear old keys and assign fresh ones in-place.
  // This mutates the SAME object reference that the cached transport holds.
  for (const key of Object.keys(headers)) {
    delete headers[key];
  }
  Object.assign(headers, freshHeaders);

  return headers;
}

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

      const freshHeaders = await buildRequestHeaders(
        connection,
        ctx,
        superUser,
      );

      const httpParams = connection.connection_headers;
      if (httpParams && "headers" in httpParams) {
        Object.assign(freshHeaders, httpParams.headers);
      }

      // Use a shared mutable headers object so the cached transport
      // picks up fresh auth headers on every subsequent request.
      const headers = refreshSharedHeaders(connectionId, freshHeaders);

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

      const freshHeaders = await buildRequestHeaders(
        connection,
        ctx,
        superUser,
      );

      const httpParams = connection.connection_headers;
      if (httpParams && "headers" in httpParams) {
        Object.assign(freshHeaders, httpParams.headers);
      }

      // Same shared-headers pattern as HTTP
      const headers = refreshSharedHeaders(connectionId, freshHeaders);

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

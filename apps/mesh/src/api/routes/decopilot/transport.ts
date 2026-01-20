/**
 * Decopilot Transport
 *
 * Creates gateway transport for MCP client connections.
 */

import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { fixProtocol } from "../oauth-proxy";

/**
 * Create a gateway transport for MCP client connection
 */
export function createGatewayTransport(
  req: Request,
  organizationId: string,
  gatewayId: string | null | undefined,
): StreamableHTTPClientTransport {
  const url = fixProtocol(new URL(req.url));
  const baseUrl = `${url.protocol}//${url.host}`;

  const headers = new Headers([["x-org-id", organizationId]]);
  for (const header of ["cookie", "authorization"]) {
    if (req.headers.has(header)) {
      headers.set(header, req.headers.get(header)!);
    }
  }

  const gatewayPath = gatewayId ? `/mcp/gateway/${gatewayId}` : "/mcp/gateway";
  const gatewayUrl = new URL(gatewayPath, baseUrl);
  gatewayUrl.searchParams.set("mode", "code_execution");

  return new StreamableHTTPClientTransport(gatewayUrl, {
    requestInit: { headers },
  });
}

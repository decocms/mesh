/**
 * Decopilot Transport
 *
 * Creates transport for MCP client connections to virtual MCP agents.
 */

import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { fixProtocol } from "../oauth-proxy";

export function createVirtualMcpTransport(
  req: Request,
  organizationId: string,
  virtualMcpId: string | null | undefined,
): StreamableHTTPClientTransport {
  // Build base URL for virtual MCP
  const url = fixProtocol(new URL(req.url));
  const baseUrl = `${url.protocol}//${url.host}`;

  // Forward cookie and authorization headers
  const headers = new Headers([["x-org-id", organizationId]]);
  const toProxy = ["cookie", "authorization"];
  for (const header of toProxy) {
    if (req.headers.has(header)) {
      headers.set(header, req.headers.get(header)!);
    }
  }

  // Encode virtualMcpId to prevent path/query injection
  const virtualMcpPath = !virtualMcpId
    ? "/mcp"
    : `/mcp/${encodeURIComponent(virtualMcpId)}`;

  const virtualMcpUrl = new URL(virtualMcpPath, baseUrl);
  virtualMcpUrl.searchParams.set("mode", "code_execution");

  return new StreamableHTTPClientTransport(virtualMcpUrl, {
    requestInit: { headers },
  });
}

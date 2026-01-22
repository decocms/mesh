import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { useSuspenseQuery } from "@tanstack/react-query";
import { KEYS } from "../lib/query-keys";
import { StreamableHTTPClientTransport } from "../lib/streamable-http-client-transport";

const DEFAULT_CLIENT_INFO = {
  name: "mesh-sdk",
  version: "1.0.0",
};

export interface UseMcpClientOptions {
  /** Connection ID - for regular connections use the connectionId, for virtual MCPs use the virtual MCP ID */
  connectionId: string | null;
  /** Organization slug - required, transforms to x-org-slug header */
  orgSlug: string;
  /** Whether this is a virtual MCP connection (default: true if connectionId is null, false otherwise) */
  isVirtualMCP?: boolean;
  /** Authorization token - optional for regular connections */
  token?: string | null;
}

/**
 * Build the MCP URL from connectionId and isVirtualMCP flag
 */
function buildMcpUrl(
  connectionId: string | null,
  isVirtualMCP: boolean,
): string | null {
  if (typeof window === "undefined") {
    throw new Error("MCP client requires a browser environment.");
  }

  if (!connectionId) {
    const path = isVirtualMCP ? "/mcp/virtual-mcp" : "/mcp";
    return new URL(path, window.location.origin).href;
  }

  // Use virtual MCP pattern if isVirtualMCP is true
  if (isVirtualMCP) {
    const path = `/mcp/virtual-mcp/${connectionId}`;
    return new URL(path, window.location.origin).href;
  }

  // Regular connection pattern
  const path = `/mcp/${connectionId}`;
  return new URL(path, window.location.origin).href;
}

/**
 * Hook to create and manage an MCP client with Streamable HTTP transport.
 * Uses Suspense - must be used within a Suspense boundary.
 *
 * @param options - Configuration for the MCP client
 * @returns The MCP client instance
 */
export function useMCPClient({
  connectionId,
  orgSlug,
  isVirtualMCP = connectionId === null,
  token,
}: UseMcpClientOptions): Client | null {
  const url = buildMcpUrl(connectionId, isVirtualMCP);
  const queryKey = KEYS.mcpClient(
    orgSlug,
    connectionId ?? "none",
    isVirtualMCP ? "virtual" : connectionId ? "connection" : "management",
    token ?? "",
  );

  const { data: client } = useSuspenseQuery({
    queryKey,
    queryFn: async () => {
      if (!url) {
        throw new Error("MCP URL is not available");
      }

      const client = new Client(DEFAULT_CLIENT_INFO, {
        capabilities: {
          tasks: {
            list: {},
            cancel: {},
            requests: {
              tool: {
                call: {},
              },
            },
          },
        },
      });

      const transport = new StreamableHTTPClientTransport(new URL(url), {
        requestInit: {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            "x-org-slug": orgSlug,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
      });

      await client.connect(transport);

      // Add toJSON method for query key serialization
      // This allows the client to be used directly in query keys
      (client as Client & { toJSON: () => string }).toJSON = () =>
        `mcp-client:${queryKey.join(":")}`;

      return client;
    },
    staleTime: Infinity, // Keep client alive while query is active
    gcTime: 0, // Clean up immediately when query is inactive
  });

  return client;
}

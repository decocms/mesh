import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { useSuspenseQuery } from "@tanstack/react-query";
import { KEYS } from "../lib/query-keys";
import { StreamableHTTPClientTransport } from "../lib/streamable-http-client-transport";

const DEFAULT_CLIENT_INFO = {
  name: "mesh-sdk",
  version: "1.0.0",
};

export interface UseMcpClientOptions {
  /** Connection ID - use the connectionId for any MCP server, or null for the management MCP */
  connectionId: string | null;
  /** Organization slug - required, transforms to x-org-slug header */
  orgSlug: string;
  /** Authorization token - optional */
  token?: string | null;
}

/**
 * Build the MCP URL from connectionId
 * Uses /mcp/:connectionId for all servers, or /mcp when connectionId is null (management MCP)
 */
function buildMcpUrl(connectionId: string | null): string {
  if (typeof window === "undefined") {
    throw new Error("MCP client requires a browser environment.");
  }

  const path = connectionId ? `/mcp/${connectionId}` : "/mcp";
  return new URL(path, window.location.origin).href;
}

/**
 * Hook to create and manage an MCP client with Streamable HTTP transport.
 * Uses Suspense - must be used within a Suspense boundary.
 *
 * @param options - Configuration for the MCP client
 * @returns The MCP client instance (never null - suspends until ready)
 */
export function useMCPClient({
  connectionId,
  orgSlug,
  token,
}: UseMcpClientOptions): Client {
  const url = buildMcpUrl(connectionId);
  const queryKey = KEYS.mcpClient(
    orgSlug,
    connectionId ?? "management",
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

  // useSuspenseQuery guarantees data is available (suspends until ready)
  return client!;
}

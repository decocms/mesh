import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { useSuspenseQuery } from "@tanstack/react-query";
import { KEYS } from "../lib/query-keys";
import { StreamableHTTPClientTransport } from "../lib/streamable-http-client-transport";

const DEFAULT_CLIENT_INFO = {
  name: "mesh-sdk",
  version: "1.0.0",
};

export interface CreateMcpClientOptions {
  /** Connection ID - use WellKnownOrgMCPId.SELF(org.id) for the self/management MCP, or any connectionId for other MCPs */
  connectionId: string | null;
  /** Organization ID - required, transforms to x-org-id header */
  orgId: string;
  /** Authorization token - optional */
  token?: string | null;
}

export type UseMcpClientOptions = CreateMcpClientOptions;

/**
 * Build the MCP URL from connectionId
 * Uses /mcp/:connectionId for all servers
 */
function buildMcpUrl(connectionId: string | null): string {
  if (typeof window === "undefined") {
    throw new Error("MCP client requires a browser environment.");
  }

  const path = connectionId ? `/mcp/${connectionId}` : "/mcp";
  return new URL(path, window.location.origin).href;
}

/**
 * Create and connect an MCP client with Streamable HTTP transport.
 * This is the low-level function for creating clients outside of React hooks.
 *
 * @param options - Configuration for the MCP client
 * @returns Promise resolving to the connected MCP client
 */
export async function createMCPClient({
  connectionId,
  orgId,
  token,
}: CreateMcpClientOptions): Promise<Client> {
  const url = buildMcpUrl(connectionId);

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
        "x-org-id": orgId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  });

  await client.connect(transport);

  // Add toJSON method for query key serialization
  // This allows the client to be used directly in query keys
  const queryKey = KEYS.mcpClient(orgId, connectionId ?? "self", token ?? "");
  (client as Client & { toJSON: () => string }).toJSON = () =>
    `mcp-client:${queryKey.join(":")}`;

  return client;
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
  orgId,
  token,
}: UseMcpClientOptions): Client {
  const queryKey = KEYS.mcpClient(orgId, connectionId ?? "", token ?? "");

  const { data: client } = useSuspenseQuery({
    queryKey,
    queryFn: () => createMCPClient({ connectionId, orgId, token }),
    staleTime: Infinity, // Keep client alive while query is active
    gcTime: 0, // Clean up immediately when query is inactive
  });

  // useSuspenseQuery guarantees data is available (suspends until ready)
  return client!;
}

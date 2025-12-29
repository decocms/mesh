import { KEYS } from "@/web/lib/query-keys";
import { useQueries } from "@tanstack/react-query";

/**
 * Resource definition from MCP protocol
 */
export interface McpResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

/**
 * JSON-RPC 2.0 response
 */
interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number | string;
  result?: T;
  error?: { code: number; message: string };
}

/**
 * Fetch resources from a single connection
 */
async function fetchResourcesForConnection(
  connectionId: string,
): Promise<McpResource[]> {
  const proxyUrl = `/mcp/${connectionId}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };

  try {
    // Initialize MCP connection
    const initResponse = await fetch(proxyUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: {
            name: "mesh-resources",
            version: "1.0.0",
          },
        },
      }),
    });

    if (!initResponse.ok) {
      return [];
    }

    const initData: JsonRpcResponse = await initResponse.json();
    if (initData.error) {
      return [];
    }

    // List resources
    const resourcesResponse = await fetch(proxyUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "resources/list",
        params: {},
      }),
    });

    if (!resourcesResponse.ok) {
      return [];
    }

    const resourcesData: JsonRpcResponse<{ resources?: McpResource[] }> =
      await resourcesResponse.json();

    if (resourcesData.error) {
      return [];
    }

    return resourcesData.result?.resources || [];
  } catch {
    return [];
  }
}

/**
 * Hook to fetch resources from multiple connections in parallel
 * Returns a Map of connectionId -> resources array
 */
export function useConnectionsResources(connectionIds: string[]) {
  const queries = useQueries({
    queries: connectionIds.map((connectionId) => ({
      queryKey: KEYS.connectionResources(connectionId),
      queryFn: () => fetchResourcesForConnection(connectionId),
      staleTime: 60000,
      retry: false,
    })),
  });

  // Combine results into a Map
  const resourcesMap = new Map<
    string,
    Array<{ uri: string; name?: string; description?: string }>
  >();
  const isLoading = queries.some((q) => q.isLoading);

  connectionIds.forEach((connectionId, index) => {
    const query = queries[index];
    if (query?.data) {
      resourcesMap.set(
        connectionId,
        query.data.map((r) => ({
          uri: r.uri,
          name: r.name,
          description: r.description,
        })),
      );
    } else {
      resourcesMap.set(connectionId, []);
    }
  });

  return { resourcesMap, isLoading };
}

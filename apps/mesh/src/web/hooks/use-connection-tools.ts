import { useQuery } from "@tanstack/react-query";

/**
 * Tool definition from MCP protocol
 */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
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
 * Fetch tools from a single connection via MCP proxy
 */
async function fetchToolsForConnection(
  connectionId: string,
): Promise<McpTool[]> {
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
          capabilities: { tools: {} },
          clientInfo: {
            name: "mesh-tools",
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

    // List tools
    const toolsResponse = await fetch(proxyUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });

    if (!toolsResponse.ok) {
      return [];
    }

    const toolsData: JsonRpcResponse<{ tools?: McpTool[] }> =
      await toolsResponse.json();

    if (toolsData.error) {
      return [];
    }

    return toolsData.result?.tools || [];
  } catch {
    return [];
  }
}

/**
 * Query key for connection tools
 */
const connectionToolsKey = (connectionId: string) =>
  ["connection", connectionId, "tools"] as const;

/**
 * Hook to fetch tools for a connection.
 * If cachedTools is provided and not empty, uses cached tools.
 * If cachedTools is null/empty, fetches dynamically from the MCP proxy.
 *
 * This handles VIRTUAL connections (which always have null tools) and
 * any other connection that doesn't have indexed tools yet.
 */
export function useConnectionTools(
  connectionId: string,
  cachedTools: McpTool[] | null | undefined,
) {
  const shouldFetch = !cachedTools || cachedTools.length === 0;

  const { data, isLoading } = useQuery({
    queryKey: connectionToolsKey(connectionId),
    queryFn: () => fetchToolsForConnection(connectionId),
    enabled: shouldFetch,
    staleTime: 60000,
    retry: false,
  });

  // If we have cached tools, use them
  if (cachedTools && cachedTools.length > 0) {
    return { tools: cachedTools, isLoading: false };
  }

  // Otherwise use dynamically fetched tools
  return { tools: data ?? [], isLoading };
}

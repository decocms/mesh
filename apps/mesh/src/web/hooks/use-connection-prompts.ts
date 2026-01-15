import { KEYS } from "@/web/lib/query-keys";
import { useQueries } from "@tanstack/react-query";

/**
 * Prompt definition from MCP protocol
 */
export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
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
 * Fetch prompts from a single connection
 */
async function fetchPromptsForConnection(
  connectionId: string,
): Promise<McpPrompt[]> {
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
          capabilities: { prompts: {} },
          clientInfo: {
            name: "mesh-prompts",
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

    const { capabilities } = initData.result as {
      capabilities?: { prompts?: unknown };
    };
    if (!capabilities?.prompts) {
      return [];
    }

    // List prompts
    const promptsResponse = await fetch(proxyUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "prompts/list",
        params: {},
      }),
    });

    if (!promptsResponse.ok) {
      return [];
    }

    const promptsData: JsonRpcResponse<{ prompts?: McpPrompt[] }> =
      await promptsResponse.json();

    if (promptsData.error) {
      return [];
    }

    return promptsData.result?.prompts || [];
  } catch {
    return [];
  }
}

/**
 * Hook to fetch prompts from multiple connections in parallel
 * Returns a Map of connectionId -> prompts array
 */
export function useConnectionsPrompts(connectionIds: string[]) {
  const queries = useQueries({
    queries: connectionIds.map((connectionId) => ({
      queryKey: KEYS.connectionPrompts(connectionId),
      queryFn: () => fetchPromptsForConnection(connectionId),
      staleTime: 60000,
      retry: false,
    })),
  });

  // Combine results into a Map
  const promptsMap = new Map<
    string,
    Array<{ name: string; description?: string }>
  >();
  const isLoading = queries.some((q) => q.isLoading);

  connectionIds.forEach((connectionId, index) => {
    const query = queries[index];
    if (query?.data) {
      promptsMap.set(
        connectionId,
        query.data.map((p) => ({ name: p.name, description: p.description })),
      );
    } else {
      promptsMap.set(connectionId, []);
    }
  });

  return { promptsMap, isLoading };
}

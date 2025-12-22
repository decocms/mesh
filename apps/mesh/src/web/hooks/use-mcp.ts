import { useQuery } from "@tanstack/react-query";
import { KEYS } from "@/web/lib/query-keys";

/**
 * Tool definition from MCP protocol
 */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * JSON-RPC 2.0 error object
 */
interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * JSON-RPC 2.0 response
 */
interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number | string;
  result?: T;
  error?: JsonRpcError;
}

/**
 * MCP connection state
 */
export type McpState = "disconnected" | "connecting" | "ready" | "error";

/**
 * Options for useMcp hook
 */
export interface UseMcpOptions {
  /** MCP server URL */
  url: string;
  /** Optional authorization token */
  token?: string | null;
  /** Whether to enable the query (default: true) */
  enabled?: boolean;
}

/**
 * Result from useMcp hook
 */
export interface UseMcpResult {
  tools: McpTool[];
  state: McpState;
  error: Error | null;
  isLoading: boolean;
  refetch: () => void;
}

/**
 * MCP hook using React Query
 *
 * Fetches tools from an MCP server.
 * Just provide the URL and optionally a token.
 */
export function useMcp({
  url,
  token,
  enabled = true,
}: UseMcpOptions): UseMcpResult {
  const query = useQuery({
    queryKey: KEYS.mcpTools(url, token),
    queryFn: async (): Promise<McpTool[]> => {
      if (!url) return [];

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      // Initialize MCP connection
      const initResponse = await fetch(url, {
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
              name: "mesh-mcp",
              version: "1.0.0",
            },
          },
        }),
      });

      if (!initResponse.ok) {
        throw new Error(`MCP initialization failed: ${initResponse.status}`);
      }

      const initData: JsonRpcResponse = await initResponse.json();
      if (initData.error) {
        throw new Error(
          `MCP initialization error: ${initData.error.message} (code: ${initData.error.code})`,
        );
      }

      // List tools
      const toolsResponse = await fetch(url, {
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
        throw new Error(`Failed to list tools: ${toolsResponse.status}`);
      }

      const toolsData: JsonRpcResponse<{ tools?: McpTool[] }> =
        await toolsResponse.json();
      if (toolsData.error) {
        throw new Error(
          `Failed to list tools: ${toolsData.error.message} (code: ${toolsData.error.code})`,
        );
      }

      return toolsData.result?.tools || [];
    },
    enabled: enabled && !!url,
    staleTime: 30000, // 30 seconds
    retry: false,
  });

  const state: McpState = !url
    ? "disconnected"
    : query.isLoading
      ? "connecting"
      : query.isError
        ? "error"
        : "ready";

  return {
    tools: query.data || [],
    state,
    error: query.error as Error | null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

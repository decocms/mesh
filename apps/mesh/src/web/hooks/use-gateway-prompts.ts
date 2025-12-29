import { useSuspenseQuery } from "@tanstack/react-query";
import { KEYS } from "../lib/query-keys";

export interface GatewayPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

/**
 * Fetch prompts from a gateway via MCP protocol
 */
async function fetchGatewayPrompts(
  gatewayId: string,
): Promise<GatewayPrompt[]> {
  const gatewayUrl = `/mcp/gateway/${gatewayId}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };

  try {
    // Initialize MCP connection
    const initResponse = await fetch(gatewayUrl, {
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
            name: "mesh-chat",
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

    // List prompts
    const promptsResponse = await fetch(gatewayUrl, {
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

    const promptsData: JsonRpcResponse<{ prompts?: GatewayPrompt[] }> =
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
 * Suspense hook to fetch prompts from a gateway via MCP protocol.
 * Must be used within a Suspense boundary.
 * @param gatewayId - The gateway ID (required)
 */
export function useGatewayPrompts(gatewayId: string) {
  return useSuspenseQuery({
    queryKey: KEYS.gatewayPrompts(gatewayId),
    queryFn: () => fetchGatewayPrompts(gatewayId),
    staleTime: 60000, // 1 minute
    retry: false,
  });
}

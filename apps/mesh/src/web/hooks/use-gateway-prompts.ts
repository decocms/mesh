import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  GetPromptRequest,
  GetPromptResult,
  ListPromptsResult,
} from "@modelcontextprotocol/sdk/types.js";
import { useSuspenseQuery } from "@tanstack/react-query";
import { KEYS } from "../lib/query-keys";

export interface GatewayPrompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export type GatewayPromptResult = GetPromptResult;

const DEFAULT_CLIENT_INFO = {
  name: "mesh-chat",
  version: "1.0.0",
};

function createGatewayTransport(gatewayId: string) {
  if (typeof window === "undefined") {
    throw new Error("Gateway prompts require a browser environment.");
  }

  const gatewayUrl = new URL(
    `/mcp/gateway/${gatewayId}`,
    window.location.origin,
  );

  const webStandardStreamableHttpTransport = new StreamableHTTPClientTransport(
    gatewayUrl,
    {
      requestInit: {
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
      },
    },
  );

  return webStandardStreamableHttpTransport;
}

async function withGatewayClient<T>(
  gatewayId: string,
  callback: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(DEFAULT_CLIENT_INFO);
  const transport = createGatewayTransport(gatewayId);

  try {
    await client.connect(transport);
    return await callback(client);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[gateway-prompts] Error for gateway ${gatewayId}:`, error);
    throw new Error(`Failed to communicate with gateway: ${message}`);
  } finally {
    await client.close().catch(console.error);
  }
}

/**
 * Fetch prompts from a gateway via MCP protocol
 */
async function fetchGatewayPrompts(
  gatewayId: string,
): Promise<GatewayPrompt[]> {
  try {
    const result = await withGatewayClient<ListPromptsResult>(
      gatewayId,
      (client) => client.listPrompts(),
    );
    return result.prompts ?? [];
  } catch (error) {
    console.error("[gateway-prompts] Failed to list prompts:", error);
    return [];
  }
}

export async function fetchGatewayPrompt(
  gatewayId: string,
  name: string,
  args?: GetPromptRequest["params"]["arguments"],
): Promise<GatewayPromptResult> {
  const argumentsValue = args ?? {};
  return await withGatewayClient<GatewayPromptResult>(gatewayId, (client) =>
    client.getPrompt({ name, arguments: argumentsValue }),
  );
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

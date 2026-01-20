import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  GetPromptRequest,
  GetPromptResult,
  ListPromptsResult,
} from "@modelcontextprotocol/sdk/types.js";
import { useSuspenseQuery } from "@tanstack/react-query";
import { KEYS } from "../lib/query-keys";

export interface VirtualMCPPrompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export type VirtualMCPPromptResult = GetPromptResult;

const DEFAULT_CLIENT_INFO = {
  name: "mesh-chat",
  version: "1.0.0",
};

function createVirtualMCPTransport(virtualMcpId: string) {
  if (typeof window === "undefined") {
    throw new Error("Virtual MCP prompts require a browser environment.");
  }

  const virtualMcpUrl = new URL(
    `/mcp/virtual-mcp/${virtualMcpId}`,
    window.location.origin,
  );

  const webStandardStreamableHttpTransport = new StreamableHTTPClientTransport(
    virtualMcpUrl,
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

async function withVirtualMCPClient<T>(
  virtualMcpId: string,
  callback: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(DEFAULT_CLIENT_INFO);
  const transport = createVirtualMCPTransport(virtualMcpId);

  try {
    await client.connect(transport);
    return await callback(client);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[virtual-mcp-prompts] Error for virtual MCP ${virtualMcpId}:`,
      error,
    );
    throw new Error(`Failed to communicate with virtual MCP: ${message}`);
  } finally {
    await client.close().catch(console.error);
  }
}

/**
 * Fetch prompts from a virtual MCP via MCP protocol
 */
export async function fetchVirtualMCPPrompts(
  virtualMcpId: string,
): Promise<VirtualMCPPrompt[]> {
  try {
    const result = await withVirtualMCPClient<ListPromptsResult>(
      virtualMcpId,
      (client) => client.listPrompts(),
    );
    return result.prompts ?? [];
  } catch (error) {
    console.error("[virtual-mcp-prompts] Failed to list prompts:", error);
    return [];
  }
}

export async function fetchVirtualMCPPrompt(
  virtualMcpId: string,
  name: string,
  args?: GetPromptRequest["params"]["arguments"],
): Promise<VirtualMCPPromptResult> {
  const argumentsValue = args ?? {};
  return await withVirtualMCPClient<VirtualMCPPromptResult>(
    virtualMcpId,
    (client) => client.getPrompt({ name, arguments: argumentsValue }),
  );
}

/**
 * Suspense hook to fetch prompts from a virtual MCP via MCP protocol.
 * Must be used within a Suspense boundary.
 * @param virtualMcpId - The virtual MCP ID (required)
 */
export function useVirtualMCPPrompts(virtualMcpId: string) {
  return useSuspenseQuery({
    queryKey: KEYS.virtualMcpPrompts(virtualMcpId),
    queryFn: () => fetchVirtualMCPPrompts(virtualMcpId),
    staleTime: 60000, // 1 minute
    retry: false,
  });
}

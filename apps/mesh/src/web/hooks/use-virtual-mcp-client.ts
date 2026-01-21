import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  GetPromptRequest,
  GetPromptResult,
  Prompt,
  Resource,
  ListPromptsResult,
  ListResourcesResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { useSuspenseQuery } from "@tanstack/react-query";
import { KEYS } from "../lib/query-keys";
import { useProjectContext } from "../providers/project-context-provider";

export type VirtualMCPPrompt = Prompt;
export type VirtualMCPPromptResult = GetPromptResult;

export type VirtualMCPResource = Resource;
export type VirtualMCPResourceResult = ReadResourceResult;

const DEFAULT_CLIENT_INFO = {
  name: "mesh-chat",
  version: "1.0.0",
};

function createVirtualMCPTransport(
  virtualMcpId: string | null,
  orgSlug: string,
) {
  if (typeof window === "undefined") {
    throw new Error("Virtual MCP client requires a browser environment.");
  }

  // For null (default virtual MCP), use base URL without trailing segment
  const path = virtualMcpId
    ? `/mcp/virtual-mcp/${virtualMcpId}`
    : `/mcp/virtual-mcp`;
  const virtualMcpUrl = new URL(path, window.location.origin);

  const webStandardStreamableHttpTransport = new StreamableHTTPClientTransport(
    virtualMcpUrl,
    {
      requestInit: {
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
          "x-org-slug": orgSlug,
        },
      },
    },
  );

  return webStandardStreamableHttpTransport;
}

async function withVirtualMCPClient<T>(
  virtualMcpId: string | null,
  orgSlug: string,
  callback: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(DEFAULT_CLIENT_INFO);
  const transport = createVirtualMCPTransport(virtualMcpId, orgSlug);

  try {
    await client.connect(transport);
    return await callback(client);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const idLabel = virtualMcpId ?? "default";
    console.error(
      `[virtual-mcp-client] Error for virtual MCP ${idLabel}:`,
      error,
    );
    throw new Error(`Failed to communicate with virtual MCP: ${message}`);
  } finally {
    await client.close().catch(console.error);
  }
}

/**
 * Fetch prompts from a virtual MCP via MCP protocol
 * @param virtualMcpId - The virtual MCP ID, or null for default virtual MCP
 * @param orgSlug - The organization slug
 */
export async function fetchVirtualMCPPrompts(
  virtualMcpId: string | null,
  orgSlug: string,
): Promise<VirtualMCPPrompt[]> {
  try {
    const result = await withVirtualMCPClient<ListPromptsResult>(
      virtualMcpId,
      orgSlug,
      (client) => client.listPrompts(),
    );
    return result.prompts ?? [];
  } catch (error) {
    console.error("[virtual-mcp-client] Failed to list prompts:", error);
    return [];
  }
}

export async function fetchVirtualMCPPrompt(
  virtualMcpId: string | null,
  orgSlug: string,
  name: string,
  args?: GetPromptRequest["params"]["arguments"],
): Promise<VirtualMCPPromptResult> {
  const argumentsValue = args ?? {};
  return await withVirtualMCPClient<VirtualMCPPromptResult>(
    virtualMcpId,
    orgSlug,
    (client) => client.getPrompt({ name, arguments: argumentsValue }),
  );
}

/**
 * Fetch resources from a virtual MCP via MCP protocol
 * @param virtualMcpId - The virtual MCP ID, or null for default virtual MCP
 * @param orgSlug - The organization slug
 */
export async function fetchVirtualMCPResources(
  virtualMcpId: string | null,
  orgSlug: string,
): Promise<VirtualMCPResource[]> {
  try {
    const result = await withVirtualMCPClient<ListResourcesResult>(
      virtualMcpId,
      orgSlug,
      (client) => client.listResources(),
    );
    return result.resources ?? [];
  } catch (error) {
    console.error("[virtual-mcp-client] Failed to list resources:", error);
    return [];
  }
}

export async function fetchVirtualMCPResource(
  virtualMcpId: string | null,
  orgSlug: string,
  uri: string,
): Promise<VirtualMCPResourceResult> {
  return await withVirtualMCPClient<VirtualMCPResourceResult>(
    virtualMcpId,
    orgSlug,
    (client) => client.readResource({ uri }),
  );
}

/**
 * Suspense hook to fetch prompts from a virtual MCP via MCP protocol.
 * Must be used within a Suspense boundary.
 * @param virtualMcpId - The virtual MCP ID, or null for default virtual MCP
 */
export function useVirtualMCPPrompts(virtualMcpId: string | null) {
  const { org } = useProjectContext();
  return useSuspenseQuery({
    queryKey: KEYS.virtualMcpPrompts(virtualMcpId, org.slug),
    queryFn: () => fetchVirtualMCPPrompts(virtualMcpId, org.slug),
    staleTime: 60000, // 1 minute
    retry: false,
  });
}

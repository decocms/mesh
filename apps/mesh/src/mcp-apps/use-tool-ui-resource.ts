/**
 * Hook for looking up tool UI resources
 *
 * This hook provides functionality to look up whether a tool
 * has an associated MCP App UI resource.
 */

import { useMCPClient, useMCPToolsListQuery } from "@decocms/mesh-sdk";
import { getUIResourceUri } from "./types.ts";

export interface ToolUIResource {
  /** The UI resource URI */
  uri: string;
  /** The connection ID for this tool */
  connectionId?: string;
}

/**
 * Hook to look up a tool's UI resource by name
 *
 * @param toolName - The name of the tool
 * @param virtualMcpId - The virtual MCP ID to look up tools from
 * @returns The tool's UI resource info if it has one, otherwise undefined
 */
export function useToolUIResource(
  toolName: string | undefined,
  virtualMcpId: string | null,
): {
  uiResource: ToolUIResource | undefined;
  isLoading: boolean;
} {
  // Get MCP client for the virtual MCP
  const { data: mcpClient } = useMCPClient({
    connectionId: virtualMcpId,
  });

  // Get tools list
  const { data: toolsData, isLoading } = useMCPToolsListQuery({
    client: mcpClient,
    enabled: !!mcpClient && !!toolName,
  });

  // Look up the tool by name and extract UI resource
  let uiResource: ToolUIResource | undefined = undefined;

  if (toolName && toolsData?.tools) {
    const tool = toolsData.tools.find((t) => t.name === toolName);
    if (tool) {
      const uri = getUIResourceUri(tool._meta);
      if (uri) {
        const connectionId =
          tool._meta &&
          typeof tool._meta === "object" &&
          "connectionId" in tool._meta
            ? (tool._meta.connectionId as string)
            : undefined;

        uiResource = {
          uri,
          connectionId,
        };
      }
    }
  }

  return {
    uiResource,
    isLoading,
  };
}

/**
 * Build a map of tool names to their UI resources
 *
 * @param tools - Array of tools from MCP tools list
 * @returns Map of tool name to UI resource info
 */
export function buildToolUIResourceMap(
  tools: Array<{
    name: string;
    _meta?: Record<string, unknown>;
  }>,
): Map<string, ToolUIResource> {
  const map = new Map<string, ToolUIResource>();

  for (const tool of tools) {
    const uri = getUIResourceUri(tool._meta);
    if (uri) {
      const connectionId =
        tool._meta && "connectionId" in tool._meta
          ? (tool._meta.connectionId as string)
          : undefined;

      map.set(tool.name, { uri, connectionId });
    }
  }

  return map;
}

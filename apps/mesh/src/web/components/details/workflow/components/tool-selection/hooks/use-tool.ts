import { useConnection } from "@/web/hooks/collections/use-connection";
import { useMcp } from "@/web/hooks/use-mcp";

export function useTool(toolName: string, connectionId: string) {
  const connection = useConnection(connectionId);
  const mcpProxyUrl = new URL(`/mcp/${connectionId}`, window.location.origin);

  // Initialize MCP client
  const mcp = useMcp({
    url: mcpProxyUrl.href,
  });

  // Find the tool definition
  const tool = mcp.tools?.find((t) => t.name === toolName);

  // Check if MCP is still loading/discovering
  const isLoading =
    mcp.state === "disconnected" ||
    mcp.state === "connecting" ||
    mcp.state === "error";

  return {
    tool,
    mcp,
    connection,
    isLoading,
  };
}

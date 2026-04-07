import { createMCPClient } from "@decocms/mesh-sdk";
import { useQuery } from "@tanstack/react-query";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { KEYS } from "@/web/lib/query-keys";
import { TOOL_NAMESPACE_PREFIXES } from "@/web/lib/tool-namespace";

/**
 * Non-suspense hook that looks up a tool definition from the virtual MCP's
 * cached tool list. Used to enrich tool call parts with metadata (`_meta`,
 * `title`, etc.) when the stream doesn't include it (e.g. Claude Code path).
 *
 * Returns `undefined` while loading or when the tool is not found.
 * Callers should fall back to regex-based display in the meantime.
 */
export function useToolDefinitionLookup(
  rawToolName: string | null,
  connectionId: string | null,
  orgId: string,
): { toolDef: Tool | undefined; isLoading: boolean } {
  const { data: toolDef, isLoading } = useQuery({
    queryKey: [
      ...KEYS.virtualMcpTools(connectionId, orgId),
      "lookup",
      rawToolName,
    ],
    queryFn: async () => {
      if (!rawToolName || !connectionId) return null;

      const client = await createMCPClient({ connectionId, orgId });
      try {
        const { tools } = await client.listTools();

        // Strip mcp__<server>__ prefix to get the gateway-namespaced name
        let stripped = rawToolName;
        for (const re of TOOL_NAMESPACE_PREFIXES) {
          const result = stripped.replace(re, "");
          if (result !== stripped) {
            stripped = result;
            break; // Only strip the first matching prefix (mcp__cms__)
          }
        }

        return tools.find((t) => t.name === stripped) ?? null;
      } finally {
        await client.close().catch(() => {});
      }
    },
    enabled: !!rawToolName && !!connectionId,
    staleTime: 60_000,
    gcTime: 300_000,
    retry: false,
  });

  return { toolDef: toolDef ?? undefined, isLoading };
}

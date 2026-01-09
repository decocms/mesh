/**
 * Hook to fetch binding schema from registry for dynamic binding resolution.
 *
 * When a binding field has `__binding.const` as an MCP Server name (e.g., "@deco/database"),
 * this hook queries ALL installed registries by MCP Server name and returns the first matching
 * MCP Server's tools as the binding schema.
 */

import { useSuspenseQueries } from "@tanstack/react-query";
import { createToolCaller } from "@/tools/client";
import { useConnections } from "@/web/hooks/collections/use-connection";
import type { BindingDefinition } from "@/web/hooks/use-binding";
import { useRegistryConnections } from "@/web/hooks/use-binding";
import { KEYS } from "@/web/lib/query-keys";
import { MCP_REGISTRY_DECOCMS_KEY } from "@/web/utils/constants";
import { findListToolName } from "@/web/utils/registry-utils";

/**
 * Registry item from the registry API response.
 */
interface RegistryItemWithBinding {
  id: string;
  _meta?: {
    [MCP_REGISTRY_DECOCMS_KEY]?: {
      id?: string;
      verified?: boolean;
      scopeName?: string;
      appName?: string;
      binding?: boolean;
      tools?: Array<{
        id?: string;
        name: string;
        description?: string | null;
        inputSchema?: Record<string, unknown> | null;
        outputSchema?: Record<string, unknown> | null;
      }>;
    };
    [key: string]: unknown;
  };
  server?: {
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Result of the useBindingSchemaFromRegistry hook
 */
interface UseBindingSchemaFromRegistryResult {
  /**
   * The resolved binding schema (tools from the binding provider MCP Server)
   * Returns undefined if not found or still loading
   */
  bindingSchema: BindingDefinition[] | undefined;
}

/**
 * Normalize MCP Server name format, ensuring @ prefix is present
 * @example
 * - "@deco/database" -> "@deco/database" (unchanged)
 * - "deco/database" -> "@deco/database" (adds @)
 */
function parseServerName(serverName: string): string {
  // Ensure @ prefix is present (server expects @scope/name format)
  return serverName.startsWith("@") ? serverName : `@${serverName}`;
}

/**
 * Extract tools from a registry item as binding definitions
 */
function extractBindingTools(
  item: RegistryItemWithBinding,
): BindingDefinition[] | undefined {
  const tools = item._meta?.[MCP_REGISTRY_DECOCMS_KEY]?.tools;

  if (!tools || tools.length === 0) {
    return undefined;
  }

  return tools.map((tool) => ({
    name: tool.name,
    inputSchema: tool.inputSchema ?? undefined,
    outputSchema: tool.outputSchema ?? undefined,
  }));
}

/**
 * Hook to fetch binding schema from registry for an MCP Server name.
 *
 * Queries ALL installed registries in parallel to find the MCP Server and returns
 * the first matching MCP Server's tools as the binding schema.
 *
 * @param serverName - The MCP Server name to fetch (e.g., "@deco/database")
 * @returns Object with bindingSchema
 *
 * @example
 * ```tsx
 * const { bindingSchema } = useBindingSchemaFromRegistry("@deco/database");
 * // bindingSchema will be the tools from the MCP Server, found in any installed registry
 * ```
 */
export function useBindingSchemaFromRegistry(
  serverName: string | undefined,
): UseBindingSchemaFromRegistryResult {
  // Get all connections and filter to registry connections
  const allConnections = useConnections();
  const registryConnections = useRegistryConnections(allConnections);

  // Parse the MCP Server name for the query
  const parsedServerName = serverName ? parseServerName(serverName) : "";

  // Build query input params using proper WhereExpression format
  const toolInputParams = parsedServerName
    ? { where: { appName: parsedServerName }, includeTools: true }
    : {};

  // Create queries for all registries in parallel
  const queries = useSuspenseQueries({
    queries: registryConnections.map((registryConnection) => {
      const registryId = registryConnection.id;
      const listToolName = findListToolName(registryConnection.tools) || "";
      const toolCaller = createToolCaller(registryId);
      const paramsKey = JSON.stringify(toolInputParams);

      return {
        queryKey: KEYS.toolCall(registryId, listToolName, paramsKey),
        queryFn: async (): Promise<RegistryItemWithBinding | null> => {
          if (!listToolName || !parsedServerName) {
            return null;
          }

          try {
            const result = (await toolCaller(
              listToolName,
              toolInputParams,
            )) as {
              items?: RegistryItemWithBinding[];
            };
            // Return the first matching item, or null if not found
            return result?.items?.[0] ?? null;
          } catch {
            // Silently fail for individual registries - we'll try others
            return null;
          }
        },
        staleTime: 5 * 60 * 1000, // 5 minutes cache
      };
    }),
  });

  // Find the first successful result with an MCP Server
  const foundServer = queries
    .map((query) => query.data)
    .find((server): server is RegistryItemWithBinding => server !== null);

  // Extract binding schema from the found MCP Server
  const bindingSchema = foundServer
    ? extractBindingTools(foundServer)
    : undefined;

  return { bindingSchema };
}

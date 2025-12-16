/**
 * Hook to fetch binding schema from registry for dynamic binding resolution.
 *
 * When a binding field has `__binding.const` as an app name (e.g., "@deco/database"),
 * this hook queries the registry by app name and returns its tools as the binding schema.
 */

import { createToolCaller } from "@/tools/client";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useRegistryConnections } from "@/web/hooks/use-binding";
import { useToolCall } from "@/web/hooks/use-tool-call";
import {
  MCP_REGISTRY_DECOCMS_KEY,
  MCP_REGISTRY_PUBLISHER_KEY,
} from "@/web/utils/constants";
import {
  findListToolName,
  extractItemsFromResponse,
} from "@/web/utils/registry-utils";
import type { BindingDefinition } from "@/web/hooks/use-binding";

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
    };
    [key: string]: unknown;
  };
  server?: {
    _meta?: {
      [MCP_REGISTRY_PUBLISHER_KEY]?: {
        friendlyName?: string | null;
        metadata?: Record<string, unknown> | null;
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
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Result of the useBindingSchemaFromRegistry hook
 */
interface UseBindingSchemaFromRegistryResult {
  /**
   * The resolved binding schema (tools from the binding provider app)
   * Returns undefined if not found or still loading
   */
  bindingSchema: BindingDefinition[] | undefined;
  /**
   * Whether the binding schema is still loading
   */
  isLoading: boolean;
  /**
   * Error if the query failed
   */
  error: Error | null;
}

/**
 * Normalize app name format, ensuring @ prefix is present
 * @example
 * - "@deco/database" -> "@deco/database" (unchanged)
 * - "deco/database" -> "@deco/database" (adds @)
 */
function parseAppName(appName: string): string {
  // Ensure @ prefix is present (server expects @scope/name format)
  return appName.startsWith("@") ? appName : `@${appName}`;
}

/**
 * Extract tools from a registry item as binding definitions
 */
function extractBindingTools(
  item: RegistryItemWithBinding,
): BindingDefinition[] | undefined {
  const tools = item.server?._meta?.[MCP_REGISTRY_PUBLISHER_KEY]?.tools;

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
 * Hook to fetch binding schema from registry for an app name.
 *
 * Queries the registry with `where: { appName }` to get the app directly
 * and returns its tools as the binding schema.
 *
 * @param appName - The app name to fetch (e.g., "@deco/database")
 * @returns Object with bindingSchema, isLoading, and error
 *
 * @example
 * ```tsx
 * const { bindingSchema, isLoading } = useBindingSchemaFromRegistry("@deco/database");
 * // bindingSchema will be the tools from the app
 * ```
 */
export function useBindingSchemaFromRegistry(
  appName: string | undefined,
): UseBindingSchemaFromRegistryResult {
  // Get all connections and filter to registry connections
  const allConnections = useConnections();
  const registryConnections = useRegistryConnections(allConnections);

  // Use first registry connection
  const registryId = registryConnections[0]?.id || "";
  const registryConnection = registryConnections[0];

  // Find the LIST tool from the registry connection
  const listToolName = findListToolName(registryConnection?.tools);

  // Parse the app name for the query - must be in "scope/appName" format
  const parsedAppName = appName ? parseAppName(appName) : "";

  // Build the tool input params - query by appName directly
  const toolInputParams = parsedAppName
    ? { where: { appName: parsedAppName } }
    : {};

  // Determine if the query should be enabled
  // parsedAppName should be in @scope/name format (e.g., "@deco/postgres")
  const isEnabled = Boolean(
    listToolName &&
      registryId &&
      parsedAppName &&
      parsedAppName.startsWith("@") &&
      parsedAppName.includes("/"),
  );

  // Create tool caller only when we have a valid registry ID
  const toolCaller = createToolCaller(registryId || undefined);

  // Query registry by appName (returns list with single result)
  const {
    data: listResults,
    isLoading,
    error,
  } = useToolCall<{ where: { appName: string } }, unknown>({
    toolCaller,
    toolName: listToolName,
    toolInputParams: toolInputParams as { where: { appName: string } },
    connectionId: registryId,
    enabled: isEnabled,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

  // Extract items from response (should be a single item when querying by appName)
  const items = extractItemsFromResponse<RegistryItemWithBinding>(listResults);

  // Get the first (and typically only) item from the result
  const app = items[0];

  // Extract binding schema (tools) from the app
  const bindingSchema = app ? extractBindingTools(app) : undefined;

  return {
    bindingSchema,
    isLoading: isEnabled && isLoading,
    error: error as Error | null,
  };
}

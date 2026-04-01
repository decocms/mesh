/**
 * Hook to fetch an MCP app's metadata from the deco registry by app ID.
 * Used for well-known first-class MCPs whose metadata lives in the registry
 * rather than being hardcoded in constants.
 */

import { useQuery } from "@tanstack/react-query";
import { KEYS, useProjectContext, WellKnownOrgMCPId } from "@decocms/mesh-sdk";
import type { RegistryItem } from "@/web/components/store/types";
import {
  callRegistryTool,
  extractItemsFromResponse,
} from "@/web/utils/registry-utils";

/**
 * Fetch an MCP app from the deco registry by its app name.
 * Results are cached via React Query with a 5-minute stale time.
 *
 * @param appId - The app name to look up (e.g., "deco/site-diagnostics")
 * @returns The registry item with title, description, icon, URL, etc.
 */
export function useRegistryApp(appId: string) {
  const { org } = useProjectContext();
  const registryId = WellKnownOrgMCPId.REGISTRY(org.id);

  return useQuery<RegistryItem | null>({
    queryKey: KEYS.registryApp(org.id, appId),
    queryFn: async () => {
      const result = await callRegistryTool(
        registryId,
        org.id,
        "COLLECTION_REGISTRY_APP_LIST",
        { where: { appName: appId } },
      );
      const items = extractItemsFromResponse<RegistryItem>(result ?? []);
      return items[0] ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Extract display metadata from a registry item for use in agent templates.
 */
export function getRegistryAppDisplay(item: RegistryItem | null | undefined): {
  id: string;
  title: string;
  icon: string | null;
} | null {
  if (!item) return null;
  return {
    id: item.id,
    title:
      item.title || item.server?.title || item.server?.name || "Unknown App",
    icon: item.server?.icons?.[0]?.src ?? null,
  };
}

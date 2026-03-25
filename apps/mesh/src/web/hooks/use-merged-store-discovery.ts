/**
 * Hook that merges store discovery items from multiple registries into a single list.
 * Each item is stamped with _sourceName, _sourceIcon, and _registryId.
 */

import { useStoreDiscovery } from "@/web/hooks/use-store-discovery";
import { findListToolName } from "@/web/utils/registry-utils";
import type { ConnectionEntity } from "@decocms/mesh-sdk";
import type { RegistryItem } from "@/web/components/store/types";

interface MergedDiscoveryResult {
  items: RegistryItem[];
  hasMore: boolean;
  isLoadingMore: boolean;
  isInitialLoading: boolean;
  loadMore: () => void;
}

/**
 * Merges items from up to 3 registry connections into a single list.
 * Items are stamped with source metadata for badges.
 */
export function useMergedStoreDiscovery(
  registries: ConnectionEntity[],
): MergedDiscoveryResult {
  const r0 = registries[0];
  const r1 = registries[1];
  const r2 = registries[2];

  const d0 = useStoreDiscovery({
    registryId: r0?.id ?? "",
    listToolName: findListToolName(r0?.tools) ?? "",
  });
  const d1 = useStoreDiscovery({
    registryId: r1?.id ?? "",
    listToolName: findListToolName(r1?.tools) ?? "",
  });
  const d2 = useStoreDiscovery({
    registryId: r2?.id ?? "",
    listToolName: findListToolName(r2?.tools) ?? "",
  });

  const discoveries = [
    { registry: r0, discovery: d0 },
    { registry: r1, discovery: d1 },
    { registry: r2, discovery: d2 },
  ].filter((d) => d.registry != null);

  const items: RegistryItem[] = [];
  for (const { registry, discovery } of discoveries) {
    if (!registry) continue;
    for (const item of discovery.items) {
      items.push({
        ...item,
        _sourceName: item._sourceName ?? registry.title,
        _sourceIcon: item._sourceIcon ?? (registry.icon || null),
        _registryId: item._registryId ?? registry.id,
      });
    }
  }

  const isInitialLoading = discoveries.some(
    (d) => d.discovery.isInitialLoading,
  );
  const isLoadingMore = discoveries.some((d) => d.discovery.isLoadingMore);
  const hasMore = discoveries.some((d) => d.discovery.hasMore);

  const loadMore = () => {
    for (const { discovery } of discoveries) {
      if (discovery.hasMore && !discovery.isLoadingMore) {
        discovery.loadMore();
      }
    }
  };

  return {
    items,
    hasMore,
    isLoadingMore,
    isInitialLoading,
    loadMore,
  };
}

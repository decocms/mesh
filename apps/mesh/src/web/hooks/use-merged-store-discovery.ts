/**
 * Hook that merges store discovery items from multiple registries into a single list.
 * Each item is stamped with _sourceName, _sourceIcon, and _registryId.
 *
 * Uses a fixed number of hook slots with `enabled` guards so that unused slots
 * don't fire API calls. Supports up to MAX_REGISTRIES concurrent registries.
 */

import { useStoreDiscovery } from "@/web/hooks/use-store-discovery";
import { findListToolName } from "@/web/utils/registry-utils";
import type { ConnectionEntity } from "@decocms/mesh-sdk";
import type { RegistryItem } from "@/web/components/store/types";

const MAX_REGISTRIES = 6;

interface MergedDiscoveryResult {
  items: RegistryItem[];
  hasMore: boolean;
  isLoadingMore: boolean;
  isInitialLoading: boolean;
  loadMore: () => void;
}

function useSlot(registry: ConnectionEntity | undefined) {
  return useStoreDiscovery({
    registryId: registry?.id ?? "",
    listToolName: findListToolName(registry?.tools) ?? "",
    enabled: registry != null,
  });
}

/**
 * Merges items from multiple registry connections into a single list.
 * Items are stamped with source metadata for badges.
 */
export function useMergedStoreDiscovery(
  registries: ConnectionEntity[],
): MergedDiscoveryResult {
  if (registries.length > MAX_REGISTRIES) {
    console.warn(
      `useMergedStoreDiscovery: only ${MAX_REGISTRIES} registries are supported, got ${registries.length}. Extra registries will be ignored.`,
    );
  }

  // Fixed hook slots — React requires the same number of hook calls every render.
  // Each slot is enabled only when a registry exists at that index.
  const d0 = useSlot(registries[0]);
  const d1 = useSlot(registries[1]);
  const d2 = useSlot(registries[2]);
  const d3 = useSlot(registries[3]);
  const d4 = useSlot(registries[4]);
  const d5 = useSlot(registries[5]);

  const allSlots = [d0, d1, d2, d3, d4, d5];
  const activeCount = Math.min(registries.length, MAX_REGISTRIES);

  const items: RegistryItem[] = [];
  for (let i = 0; i < activeCount; i++) {
    const registry = registries[i]!;
    const discovery = allSlots[i]!;
    for (const item of discovery.items) {
      items.push({
        ...item,
        _sourceName: item._sourceName ?? registry.title,
        _sourceIcon: item._sourceIcon ?? (registry.icon || null),
        _registryId: item._registryId ?? registry.id,
      });
    }
  }

  const activeSlots = allSlots.slice(0, activeCount);
  const isInitialLoading = activeSlots.some((d) => d.isInitialLoading);
  const isLoadingMore = activeSlots.some((d) => d.isLoadingMore);
  const hasMore = activeSlots.some((d) => d.hasMore);

  const loadMore = () => {
    for (const d of activeSlots) {
      if (d.hasMore && !d.isLoadingMore) {
        d.loadMore();
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

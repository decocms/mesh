/**
 * Hook that merges store discovery items from all enabled registries into a single list.
 * Each item is stamped with _sourceName, _sourceIcon, and _registryId.
 *
 * Uses independent useInfiniteQuery per registry so fast registries don't block slow ones.
 * Non-community items are shown first; community items only appear after all
 * non-community registries are fully loaded (exhausted). Items always append at the
 * bottom — never insert mid-list.
 */

import { useRef } from "react";
import { useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import { useProjectContext } from "@decocms/mesh-sdk";
import { createMCPClient } from "@decocms/mesh-sdk";
import {
  inferRegistryListToolName,
  flattenPaginatedItems,
} from "@/web/utils/registry-utils";
import { KEYS } from "@/web/lib/query-keys";
import type { RegistryItem } from "@/web/components/store/types";

const PAGE_SIZE = 24;

/**
 * Maximum number of non-community registry query slots.
 * Each slot corresponds to one unconditional useInfiniteQuery call.
 * Registries beyond this limit are silently ignored with a dev warning.
 */
const MAX_NON_COMMUNITY_SLOTS = 10;

/** Minimal registry source descriptor — only needs id, title, icon */
export interface RegistrySource {
  id: string;
  title: string;
  icon: string | null;
}

interface MergedDiscoveryResult {
  items: RegistryItem[];
  hasMore: boolean;
  isLoadingMore: boolean;
  isInitialLoading: boolean;
  loadMore: () => void;
}

interface SingleRegistryResult {
  items: RegistryItem[];
  hasMore: boolean;
  isLoadingMore: boolean;
  isInitialLoading: boolean;
  fetchNextPage: () => void;
}

function isCommunityRegistry(registry: RegistrySource): boolean {
  return registry.id.includes("community-registry");
}

function useSingleRegistryQuery(
  registry: RegistrySource | null,
  orgId: string,
  enabled: boolean,
): SingleRegistryResult {
  const registryId = registry?.id ?? "";
  const listToolName = registry
    ? inferRegistryListToolName(registry.id, orgId)
    : "";

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: KEYS.storeDiscovery(orgId, registryId),
      queryFn: async ({ pageParam }) => {
        const client = await createMCPClient({
          connectionId: registryId,
          orgId,
        });

        try {
          const params: Record<string, unknown> = { limit: PAGE_SIZE };
          if (pageParam) {
            params.cursor = pageParam;
          }

          const result = (await client.callTool({
            name: listToolName,
            arguments: params,
          })) as { structuredContent?: unknown };

          return (result.structuredContent ?? result) as Record<
            string,
            unknown
          >;
        } finally {
          await client.close().catch(() => {});
        }
      },
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage) => {
        if (typeof lastPage === "object" && lastPage !== null) {
          const nextCursor =
            (lastPage as { nextCursor?: string; cursor?: string }).nextCursor ||
            (lastPage as { nextCursor?: string; cursor?: string }).cursor;
          if (nextCursor) return nextCursor;
        }
        return undefined;
      },
      staleTime: 60 * 60 * 1000,
      placeholderData: keepPreviousData,
      retry: 2,
      enabled: enabled && registry !== null,
    });

  const rawItems = flattenPaginatedItems<RegistryItem>(data?.pages);

  // Stamp source metadata
  const items: RegistryItem[] = registry
    ? rawItems.map((item) => ({
        ...item,
        _sourceName: item._sourceName ?? registry.title,
        _sourceIcon: item._sourceIcon ?? registry.icon,
        _registryId: item._registryId ?? registry.id,
      }))
    : [];

  return {
    items,
    hasMore: hasNextPage ?? false,
    isLoadingMore: isFetchingNextPage,
    isInitialLoading: isLoading,
    fetchNextPage: () => {
      if (hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
  };
}

function resolveSlot(
  registries: RegistrySource[],
  index: number,
): RegistrySource | null {
  return registries[index] ?? null;
}

export function useMergedStoreDiscovery(
  registries: RegistrySource[],
): MergedDiscoveryResult {
  const { org } = useProjectContext();

  // Classify and sort for stable ordering
  const sorted = [...registries].sort((a, b) => {
    const aCom = isCommunityRegistry(a) ? 1 : 0;
    const bCom = isCommunityRegistry(b) ? 1 : 0;
    if (aCom !== bCom) return aCom - bCom;
    return a.id.localeCompare(b.id);
  });

  const nonCommunityRegistries = sorted.filter((r) => !isCommunityRegistry(r));
  const communityRegistries = sorted.filter((r) => isCommunityRegistry(r));

  if (
    process.env.NODE_ENV !== "production" &&
    nonCommunityRegistries.length > MAX_NON_COMMUNITY_SLOTS
  ) {
    console.warn(
      `[useMergedStoreDiscovery] ${nonCommunityRegistries.length} non-community registries exceed the ${MAX_NON_COMMUNITY_SLOTS}-slot limit. Some registries will be ignored.`,
    );
  }

  // 10 non-community query slots (hooks must be called unconditionally)
  const nc0 = useSingleRegistryQuery(
    resolveSlot(nonCommunityRegistries, 0),
    org.id,
    true,
  );
  const nc1 = useSingleRegistryQuery(
    resolveSlot(nonCommunityRegistries, 1),
    org.id,
    true,
  );
  const nc2 = useSingleRegistryQuery(
    resolveSlot(nonCommunityRegistries, 2),
    org.id,
    true,
  );
  const nc3 = useSingleRegistryQuery(
    resolveSlot(nonCommunityRegistries, 3),
    org.id,
    true,
  );
  const nc4 = useSingleRegistryQuery(
    resolveSlot(nonCommunityRegistries, 4),
    org.id,
    true,
  );
  const nc5 = useSingleRegistryQuery(
    resolveSlot(nonCommunityRegistries, 5),
    org.id,
    true,
  );
  const nc6 = useSingleRegistryQuery(
    resolveSlot(nonCommunityRegistries, 6),
    org.id,
    true,
  );
  const nc7 = useSingleRegistryQuery(
    resolveSlot(nonCommunityRegistries, 7),
    org.id,
    true,
  );
  const nc8 = useSingleRegistryQuery(
    resolveSlot(nonCommunityRegistries, 8),
    org.id,
    true,
  );
  const nc9 = useSingleRegistryQuery(
    resolveSlot(nonCommunityRegistries, 9),
    org.id,
    true,
  );
  const ncQueries = [nc0, nc1, nc2, nc3, nc4, nc5, nc6, nc7, nc8, nc9];
  const activeNcCount = Math.min(
    nonCommunityRegistries.length,
    MAX_NON_COMMUNITY_SLOTS,
  );
  const activeNcQueries = ncQueries.slice(0, activeNcCount);

  // Community queries are deferred until all non-community registries are exhausted
  const allNonCommunityExhausted = activeNcQueries.every(
    (q) => !q.hasMore && !q.isInitialLoading,
  );

  const c0 = useSingleRegistryQuery(
    resolveSlot(communityRegistries, 0),
    org.id,
    allNonCommunityExhausted,
  );
  const activeCQueries = communityRegistries.length > 0 ? [c0] : [];

  // Stable key to detect registry list changes and reset committed items
  const registryKey = registries
    .map((r) => r.id)
    .sort()
    .join(",");
  const prevRegistryKeyRef = useRef(registryKey);
  const committedItemsRef = useRef<RegistryItem[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());

  if (prevRegistryKeyRef.current !== registryKey) {
    committedItemsRef.current = [];
    seenIdsRef.current = new Set();
    prevRegistryKeyRef.current = registryKey;
  }

  // Collect all available items in priority order
  const allAvailable: RegistryItem[] = [];
  for (const q of activeNcQueries) {
    allAvailable.push(...q.items);
  }
  if (allNonCommunityExhausted) {
    for (const q of activeCQueries) {
      allAvailable.push(...q.items);
    }
  }

  // Append only new items (preserves position of existing items)
  for (const item of allAvailable) {
    const itemKey = `${item._registryId}:${item.id}`;
    if (!seenIdsRef.current.has(itemKey)) {
      seenIdsRef.current.add(itemKey);
      committedItemsRef.current.push(item);
    }
  }

  const items = committedItemsRef.current;

  // Aggregate loading state
  const allActive = [...activeNcQueries, ...activeCQueries];
  const isInitialLoading = activeNcQueries.some((q) => q.isInitialLoading);
  const isLoadingMore = allActive.some((q) => q.isLoadingMore);

  const hasMore = (() => {
    if (activeNcQueries.some((q) => q.hasMore)) return true;
    if (activeCQueries.length > 0) {
      if (!allNonCommunityExhausted) return true;
      return activeCQueries.some((q) => q.hasMore);
    }
    return false;
  })();

  const loadMore = () => {
    // Prioritize non-community registries
    if (activeNcQueries.some((q) => q.hasMore)) {
      for (const q of activeNcQueries) {
        if (q.hasMore && !q.isLoadingMore) {
          q.fetchNextPage();
        }
      }
      return;
    }

    // Non-community exhausted — load community
    for (const q of activeCQueries) {
      if (q.hasMore && !q.isLoadingMore) {
        q.fetchNextPage();
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

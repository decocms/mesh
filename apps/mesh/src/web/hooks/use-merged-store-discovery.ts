/**
 * Hook that merges store discovery items from all enabled registries into a single list.
 * Each item is stamped with _sourceName, _sourceIcon, and _registryId.
 *
 * Uses two useInfiniteQuery calls — one for all non-community registries and one for
 * community. Within each group, registries are fetched in parallel via Promise.allSettled.
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
const RETRY_ATTEMPTS = 3;

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

/** Per-registry result within a group page */
interface RegistryPageResult {
  registryId: string;
  registryTitle: string;
  registryIcon: string | null;
  items: RegistryItem[];
  nextCursor?: string;
}

/** Page param tracks cursors per registry within the group */
type PageParam = Record<string, string | undefined>;

function isCommunityRegistry(registry: RegistrySource): boolean {
  return registry.id.includes("community-registry");
}

/**
 * Fetches a page from a group of registries in parallel.
 * Each registry tracks its own cursor independently.
 */
function useRegistryGroupQuery(
  registries: RegistrySource[],
  orgId: string,
  enabled: boolean,
) {
  const groupKey = registries
    .map((r) => r.id)
    .sort()
    .join(",");

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: KEYS.storeDiscovery(orgId, groupKey),
      queryFn: async ({ pageParam }): Promise<RegistryPageResult[]> => {
        const cursors: PageParam = pageParam ?? {};

        const results = await Promise.all(
          registries.map(async (registry): Promise<RegistryPageResult> => {
            const cursor = cursors[registry.id];
            if (cursor === "EXHAUSTED") {
              return {
                registryId: registry.id,
                registryTitle: registry.title,
                registryIcon: registry.icon,
                items: [],
              };
            }

            const listToolName = inferRegistryListToolName(registry.id, orgId);

            // Per-registry retry (2 attempts) since Promise.all would
            // otherwise let one failure reject the entire group
            let lastError: unknown;
            for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
              const client = await createMCPClient({
                connectionId: registry.id,
                orgId,
              });

              try {
                const params: Record<string, unknown> = { limit: PAGE_SIZE };
                if (cursor) {
                  params.cursor = cursor;
                }

                const result = (await client.callTool({
                  name: listToolName,
                  arguments: params,
                })) as { structuredContent?: unknown };

                const payload = (result.structuredContent ?? result) as Record<
                  string,
                  unknown
                >;

                const nextCursor =
                  (payload as { nextCursor?: string; cursor?: string })
                    .nextCursor ||
                  (payload as { nextCursor?: string; cursor?: string })
                    .cursor ||
                  undefined;

                const items = flattenPaginatedItems<RegistryItem>(
                  payload ? [payload] : [],
                );

                return {
                  registryId: registry.id,
                  registryTitle: registry.title,
                  registryIcon: registry.icon,
                  items,
                  nextCursor,
                };
              } catch (err) {
                lastError = err;
              } finally {
                await client.close().catch(() => {});
              }
            }

            // All retries exhausted — log and return empty so other registries
            // in the group are not affected
            console.warn(
              `[useMergedStoreDiscovery] Registry "${registry.title}" (${registry.id}) failed after ${RETRY_ATTEMPTS} attempts:`,
              lastError,
            );
            return {
              registryId: registry.id,
              registryTitle: registry.title,
              registryIcon: registry.icon,
              items: [],
            };
          }),
        );

        return results;
      },
      initialPageParam: {} as PageParam,
      getNextPageParam: (lastPage) => {
        const nextCursors: PageParam = {};
        let anyHasMore = false;

        for (const result of lastPage) {
          if (!result.registryId) continue;
          if (result.nextCursor) {
            nextCursors[result.registryId] = result.nextCursor;
            anyHasMore = true;
          } else {
            nextCursors[result.registryId] = "EXHAUSTED";
          }
        }

        return anyHasMore ? nextCursors : undefined;
      },
      staleTime: 60 * 60 * 1000,
      placeholderData: keepPreviousData,
      retry: false,
      enabled: enabled && registries.length > 0,
    });

  // Flatten all pages, stamp source metadata
  const items: RegistryItem[] = [];
  if (data?.pages) {
    for (const page of data.pages) {
      for (const registryResult of page) {
        for (const item of registryResult.items) {
          items.push({
            ...item,
            _sourceName: item._sourceName ?? registryResult.registryTitle,
            _sourceIcon: item._sourceIcon ?? registryResult.registryIcon,
            _registryId: item._registryId ?? registryResult.registryId,
          });
        }
      }
    }
  }

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

export function useMergedStoreDiscovery(
  registries: RegistrySource[],
): MergedDiscoveryResult {
  const { org } = useProjectContext();

  const nonCommunityRegistries = registries.filter(
    (r) => !isCommunityRegistry(r),
  );
  const communityRegistries = registries.filter((r) => isCommunityRegistry(r));

  // Query 1: all non-community registries in parallel (always enabled)
  const ncQuery = useRegistryGroupQuery(nonCommunityRegistries, org.id, true);

  // Query 2: community registries, deferred until non-community is exhausted
  const allNonCommunityExhausted =
    !ncQuery.hasMore && !ncQuery.isInitialLoading;
  const cQuery = useRegistryGroupQuery(
    communityRegistries,
    org.id,
    allNonCommunityExhausted,
  );

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
  const allAvailable: RegistryItem[] = [...ncQuery.items];
  if (allNonCommunityExhausted) {
    allAvailable.push(...cQuery.items);
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

  const isInitialLoading = ncQuery.isInitialLoading;
  const isLoadingMore = ncQuery.isLoadingMore || cQuery.isLoadingMore;

  const hasMore = (() => {
    if (ncQuery.hasMore) return true;
    if (communityRegistries.length > 0) {
      if (!allNonCommunityExhausted) return true;
      return cQuery.hasMore;
    }
    return false;
  })();

  const loadMore = () => {
    if (ncQuery.hasMore) {
      ncQuery.fetchNextPage();
      return;
    }
    if (cQuery.hasMore) {
      cQuery.fetchNextPage();
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

/**
 * Hook that merges store discovery items from all enabled registries into a single list.
 * Each item is stamped with _sourceName, _sourceIcon, and _registryId.
 *
 * Uses a single useInfiniteQuery that fetches from all registries in parallel,
 * so there's no hardcoded limit on registry count.
 */

import { useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import { useProjectContext } from "@decocms/mesh-sdk";
import { createMCPClient } from "@decocms/mesh-sdk";
import { findListToolName } from "@/web/utils/registry-utils";
import { flattenPaginatedItems } from "@/web/utils/registry-utils";
import type { ConnectionEntity } from "@decocms/mesh-sdk";
import type { RegistryItem } from "@/web/components/store/types";

const PAGE_SIZE = 24;

interface MergedDiscoveryResult {
  items: RegistryItem[];
  hasMore: boolean;
  isLoadingMore: boolean;
  isInitialLoading: boolean;
  loadMore: () => void;
}

/** Per-registry page result with cursor tracking */
interface RegistryPageResult {
  registryId: string;
  registryTitle: string;
  registryIcon: string | null;
  items: RegistryItem[];
  nextCursor?: string;
}

/** Page param tracks cursors per registry */
type PageParam = Record<string, string | undefined>;

export function useMergedStoreDiscovery(
  registries: ConnectionEntity[],
): MergedDiscoveryResult {
  const { org } = useProjectContext();

  // Stable key based on sorted registry IDs
  const registryKey = registries
    .map((r) => r.id)
    .sort()
    .join(",");

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ["merged-store-discovery", org.id, registryKey],
      queryFn: async ({ pageParam }): Promise<RegistryPageResult[]> => {
        const cursors: PageParam = pageParam ?? {};

        // Fetch from all registries in parallel
        const results = await Promise.allSettled(
          registries.map(async (registry): Promise<RegistryPageResult> => {
            const listToolName = findListToolName(registry.tools);
            if (!listToolName) {
              return {
                registryId: registry.id,
                registryTitle: registry.title,
                registryIcon: registry.icon || null,
                items: [],
              };
            }

            // Skip registries whose cursor is exhausted (null sentinel)
            const cursor = cursors[registry.id];
            if (cursor === "EXHAUSTED") {
              return {
                registryId: registry.id,
                registryTitle: registry.title,
                registryIcon: registry.icon || null,
                items: [],
              };
            }

            const client = await createMCPClient({
              connectionId: registry.id,
              orgId: org.id,
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

              // Extract cursor
              const nextCursor =
                (payload as { nextCursor?: string; cursor?: string })
                  .nextCursor ||
                (payload as { nextCursor?: string; cursor?: string }).cursor ||
                undefined;

              // Extract items
              const items = flattenPaginatedItems<RegistryItem>(
                payload ? [payload] : [],
              );

              return {
                registryId: registry.id,
                registryTitle: registry.title,
                registryIcon: registry.icon || null,
                items,
                nextCursor,
              };
            } finally {
              await client.close().catch(() => {});
            }
          }),
        );

        return results.map((r) =>
          r.status === "fulfilled"
            ? r.value
            : {
                registryId: "",
                registryTitle: "",
                registryIcon: null,
                items: [],
              },
        );
      },
      initialPageParam: {} as PageParam,
      getNextPageParam: (lastPage) => {
        // Build next cursors — mark exhausted registries
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
      retry: 2,
      enabled: registries.length > 0,
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

  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  return {
    items,
    hasMore: hasNextPage ?? false,
    isLoadingMore: isFetchingNextPage,
    isInitialLoading: isLoading,
    loadMore,
  };
}

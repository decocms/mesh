/**
 * Hook that discovers store items via the unified REGISTRY_LIST tool.
 *
 * The backend handles multi-registry fan-out, cursor tracking, and ordering
 * (non-community first, community after). This hook is a thin wrapper around
 * useInfiniteQuery calling REGISTRY_LIST on the self MCP.
 */

import { useRef } from "react";
import { useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { KEYS } from "@/web/lib/query-keys";
import type { RegistryItem } from "@/web/components/store/types";

const PAGE_SIZE = 24;

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

/** Response shape from REGISTRY_LIST */
interface RegistryListResponse {
  items: Array<{
    id: string;
    name: string | null;
    title: string | null;
    description: string | null;
    icon: string | null;
    verified?: boolean;
    publisher: string | null;
    registryId: string;
    registryName: string;
    server: Record<string, unknown>;
    tags?: string[];
    categories?: string[];
    updatedAt: string | null;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Map a unified registry item to the frontend RegistryItem shape.
 * Preserves backward compatibility with components expecting the old shape.
 */
function toFrontendItem(
  item: RegistryListResponse["items"][number],
): RegistryItem {
  return {
    ...item,
    updated_at: item.updatedAt,
    _sourceName: item.registryName,
    _sourceIcon: null,
    _registryId: item.registryId,
    server: item.server,
  } as unknown as RegistryItem;
}

export function useMergedStoreDiscovery(
  _registries: RegistrySource[],
): MergedDiscoveryResult {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const registryKey = _registries
    .map((r) => r.id)
    .sort()
    .join(",");

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: KEYS.storeDiscovery(org.id, registryKey),
      queryFn: async ({ pageParam }): Promise<RegistryListResponse> => {
        const args: Record<string, unknown> = { limit: PAGE_SIZE };
        if (pageParam) {
          args.cursor = pageParam;
        }

        const result = (await client.callTool({
          name: "REGISTRY_LIST",
          arguments: args,
        })) as { structuredContent?: unknown };

        const payload = (result.structuredContent ?? result) as
          | RegistryListResponse
          | undefined;
        return (
          payload ?? {
            items: [],
            nextCursor: null,
            hasMore: false,
          }
        );
      },
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      staleTime: 60 * 60 * 1000,
      placeholderData: keepPreviousData,
      retry: false,
      enabled: _registries.length > 0,
    });

  // Stable deduplication across pages
  const prevRegistryKeyRef = useRef(registryKey);
  const committedItemsRef = useRef<RegistryItem[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());

  if (prevRegistryKeyRef.current !== registryKey) {
    committedItemsRef.current = [];
    seenIdsRef.current = new Set();
    prevRegistryKeyRef.current = registryKey;
  }

  if (data?.pages) {
    for (const page of data.pages) {
      for (const item of page.items) {
        const itemKey = `${item.registryId}:${item.id}`;
        if (!seenIdsRef.current.has(itemKey)) {
          seenIdsRef.current.add(itemKey);
          committedItemsRef.current.push(toFrontendItem(item));
        }
      }
    }
  }

  return {
    items: committedItemsRef.current,
    hasMore: hasNextPage ?? false,
    isLoadingMore: isFetchingNextPage,
    isInitialLoading: isLoading,
    loadMore: () => {
      if (hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
  };
}

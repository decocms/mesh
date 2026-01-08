/**
 * Hook for store discovery data fetching
 *
 * Handles pagination, filtering, and data management for registry items.
 */

import { useState } from "react";
import {
  useInfiniteQuery,
  useSuspenseQuery,
  keepPreviousData,
} from "@tanstack/react-query";
import { createToolCaller } from "@/tools/client";
import { KEYS } from "@/web/lib/query-keys";
import { flattenPaginatedItems } from "@/web/utils/registry-utils";
import type {
  RegistryItem,
  RegistryFiltersResponse,
  FilterItem,
} from "@/web/components/store/types";

const PAGE_SIZE = 24;

interface UseStoreDiscoveryOptions {
  registryId: string;
  listToolName: string;
  filtersToolName?: string;
  /** Search term for server-side filtering */
  search?: string;
}

interface UseStoreDiscoveryResult {
  /** Flattened list of registry items */
  items: RegistryItem[];
  /** Total count from API if available */
  totalCount: number | null;
  /** Whether more pages are available */
  hasMore: boolean;
  /** Whether currently loading more items */
  isLoadingMore: boolean;
  /** Whether filtering is in progress */
  isFiltering: boolean;
  /** Whether initial load is in progress */
  isInitialLoading: boolean;
  /** Whether fetching in background (for subtle loading indicator) */
  isFetching: boolean;
  /** Function to load more items */
  loadMore: () => void;
  /** Available tags for filtering */
  availableTags?: FilterItem[];
  /** Available categories for filtering */
  availableCategories?: FilterItem[];
  /** Currently selected tags */
  selectedTags: string[];
  /** Currently selected categories */
  selectedCategories: string[];
  /** Update selected tags */
  setSelectedTags: (tags: string[]) => void;
  /** Update selected categories */
  setSelectedCategories: (categories: string[]) => void;
  /** Whether any filters are active */
  hasActiveFilters: boolean;
}

/**
 * Hook for fetching and managing store discovery data
 */
export function useStoreDiscovery({
  registryId,
  listToolName,
  filtersToolName,
  search,
}: UseStoreDiscoveryOptions): UseStoreDiscoveryResult {
  // Filter state
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const toolCaller = createToolCaller(registryId);
  const hasFiltersSupport = Boolean(filtersToolName);

  // Fetch available filters (only if supported)
  const { data: filtersData } = useSuspenseQuery<RegistryFiltersResponse>({
    queryKey: KEYS.toolCall(registryId, filtersToolName || "no-filters", "{}"),
    queryFn: async () => {
      if (!filtersToolName) {
        return { tags: [], categories: [] };
      }
      const result = await toolCaller(filtersToolName, {});
      return result as RegistryFiltersResponse;
    },
    staleTime: 60 * 60 * 1000, // 1 hour - filters don't change often
  });

  // Build where clause for server-side search
  const searchWhereClause = search
    ? {
        operator: "or" as const,
        conditions: [
          { field: ["name"], operator: "contains" as const, value: search },
          { field: ["title"], operator: "contains" as const, value: search },
          {
            field: ["description"],
            operator: "contains" as const,
            value: search,
          },
        ],
      }
    : undefined;

  // Build filter params for the LIST API call
  const filterParams = {
    limit: PAGE_SIZE,
    ...(selectedTags.length > 0 && { tags: selectedTags }),
    ...(selectedCategories.length > 0 && { categories: selectedCategories }),
    ...(searchWhereClause && { where: searchWhereClause }),
  };

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
    isLoading,
  } = useInfiniteQuery({
    queryKey: KEYS.toolCall(
      registryId,
      listToolName,
      JSON.stringify(filterParams),
    ),
    queryFn: async ({ pageParam }) => {
      const params = pageParam
        ? { ...filterParams, cursor: pageParam }
        : filterParams;
      const result = await toolCaller(listToolName, params);
      return result;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (typeof lastPage === "object" && lastPage !== null) {
        const nextCursor =
          (lastPage as { nextCursor?: string; cursor?: string }).nextCursor ||
          (lastPage as { nextCursor?: string; cursor?: string }).cursor;

        if (nextCursor) {
          return nextCursor;
        }
      }
      return undefined;
    },
    staleTime: 60 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  // Extract totalCount from first page if available
  const totalCount = (() => {
    if (!data?.pages || data.pages.length === 0) return null;
    const firstPage = data.pages[0];
    if (
      typeof firstPage === "object" &&
      firstPage !== null &&
      "totalCount" in firstPage &&
      typeof firstPage.totalCount === "number"
    ) {
      return firstPage.totalCount;
    }
    return null;
  })();

  // Flatten all pages into a single array of items
  const items = flattenPaginatedItems<RegistryItem>(data?.pages);

  const hasActiveFilters =
    selectedTags.length > 0 || selectedCategories.length > 0 || Boolean(search);

  // Show filtering indicator when fetching due to filter change
  const isFiltering =
    isFetching && !isFetchingNextPage && !isLoading && hasActiveFilters;

  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  return {
    items,
    totalCount,
    hasMore: hasNextPage ?? false,
    isLoadingMore: isFetchingNextPage,
    isFiltering,
    isInitialLoading: isLoading,
    isFetching,
    loadMore,
    availableTags: hasFiltersSupport ? filtersData?.tags : undefined,
    availableCategories: hasFiltersSupport
      ? filtersData?.categories
      : undefined,
    selectedTags,
    selectedCategories,
    setSelectedTags,
    setSelectedCategories,
    hasActiveFilters,
  };
}

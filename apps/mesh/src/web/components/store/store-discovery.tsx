import { useConnection } from "@/web/hooks/collections/use-connection";
import { createToolCaller } from "@/tools/client";
import { StoreDiscoveryUI } from "./store-discovery-ui";
import type { RegistryItem } from "./registry-items-section";
import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { KEYS } from "@/web/lib/query-keys";
import { useState } from "react";
import {
  findListToolName,
  findFiltersToolName,
  flattenPaginatedItems,
} from "@/web/utils/registry-utils";

/** Filter item with value and count */
export interface FilterItem {
  value: string;
  count: number;
}

/** Response from COLLECTION_REGISTRY_APP_FILTERS tool */
export interface RegistryFiltersResponse {
  tags?: FilterItem[];
  categories?: FilterItem[];
}

/** Active filters state */
export interface ActiveFilters {
  tags: string[];
  categories: string[];
}

interface StoreDiscoveryProps {
  registryId: string;
}

const PAGE_SIZE = 24;

/**
 * Inner component that handles data fetching with proper suspense
 * Only rendered when we know if filters are supported or not
 */
function StoreDiscoveryContent({
  registryId,
  listToolName,
  filtersToolName,
}: {
  registryId: string;
  listToolName: string;
  filtersToolName: string;
}) {
  // Filter state - lifted here so we can use it in the query
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const toolCaller = createToolCaller(registryId);

  // Fetch available filters - uses suspense so it loads with the list
  const { data: filtersData } = useSuspenseQuery<RegistryFiltersResponse>({
    queryKey: KEYS.toolCall(registryId, filtersToolName, "{}"),
    queryFn: async () => {
      const result = await toolCaller(filtersToolName, {});
      return result as RegistryFiltersResponse;
    },
    staleTime: 60 * 60 * 1000, // 1 hour - filters don't change often
  });

  // Build filter params for the LIST API call
  const filterParams = {
    limit: PAGE_SIZE,
    ...(selectedTags.length > 0 && { tags: selectedTags }),
    ...(selectedCategories.length > 0 && { categories: selectedCategories }),
  };

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isFetching } =
    useSuspenseInfiniteQuery({
      // Include filters in query key so it refetches when filters change
      queryKey: KEYS.toolCall(
        registryId,
        listToolName,
        JSON.stringify(filterParams),
      ),
      queryFn: async ({ pageParam }) => {
        // Use cursor if available, otherwise fallback to offset for backward compatibility
        const params = pageParam
          ? { ...filterParams, cursor: pageParam }
          : filterParams;
        const result = await toolCaller(listToolName, params);
        return result;
      },
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage) => {
        // Only proceed with pagination if API provides a cursor
        // If no cursor is available, return undefined to stop pagination
        if (typeof lastPage === "object" && lastPage !== null) {
          const nextCursor =
            (lastPage as { nextCursor?: string; cursor?: string }).nextCursor ||
            (lastPage as { nextCursor?: string; cursor?: string }).cursor;

          // Only return cursor if API explicitly provides one
          if (nextCursor) {
            return nextCursor;
          }
        }

        // No cursor available - stop pagination
        return undefined;
      },
      staleTime: 60 * 60 * 1000, // 1 hour - keep data fresh longer
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
  const flattenedItems = flattenPaginatedItems<RegistryItem>(data?.pages);

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const hasActiveFilters =
    selectedTags.length > 0 || selectedCategories.length > 0;

  return (
    <StoreDiscoveryUI
      items={flattenedItems}
      isLoadingMore={isFetchingNextPage}
      isFiltering={isFetching && !isFetchingNextPage && hasActiveFilters}
      registryId={registryId}
      hasMore={hasNextPage ?? false}
      onLoadMore={handleLoadMore}
      totalCount={totalCount}
      availableTags={filtersData?.tags}
      availableCategories={filtersData?.categories}
      selectedTags={selectedTags}
      selectedCategories={selectedCategories}
      onTagChange={setSelectedTags}
      onCategoryChange={setSelectedCategories}
    />
  );
}

/**
 * Variant without filters support - simpler data fetching
 */
function StoreDiscoveryWithoutFilters({
  registryId,
  listToolName,
}: {
  registryId: string;
  listToolName: string;
}) {
  const toolCaller = createToolCaller(registryId);

  const filterParams = { limit: PAGE_SIZE };

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery({
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
    });

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

  const flattenedItems = flattenPaginatedItems<RegistryItem>(data?.pages);

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  return (
    <StoreDiscoveryUI
      items={flattenedItems}
      isLoadingMore={isFetchingNextPage}
      isFiltering={false}
      registryId={registryId}
      hasMore={hasNextPage ?? false}
      onLoadMore={handleLoadMore}
      totalCount={totalCount}
      availableTags={undefined}
      availableCategories={undefined}
      selectedTags={[]}
      selectedCategories={[]}
      onTagChange={() => {}}
      onCategoryChange={() => {}}
    />
  );
}

export function StoreDiscovery({ registryId }: StoreDiscoveryProps) {
  const registryConnection = useConnection(registryId);

  // Find the LIST tool from the registry connection
  const listToolName = findListToolName(registryConnection?.tools);
  if (!listToolName) {
    throw new Error("This registry does not support listing store items.");
  }

  // Find the FILTERS tool (optional - not all registries support it)
  const filtersToolName = findFiltersToolName(registryConnection?.tools);

  // Render appropriate component based on filters support
  // This ensures both queries use suspense and load together
  if (filtersToolName) {
    return (
      <StoreDiscoveryContent
        registryId={registryId}
        listToolName={listToolName}
        filtersToolName={filtersToolName}
      />
    );
  }

  return (
    <StoreDiscoveryWithoutFilters
      registryId={registryId}
      listToolName={listToolName}
    />
  );
}

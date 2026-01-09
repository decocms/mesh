import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Inbox01, SearchMd, Loading01, FilterLines } from "@untitledui/icons";
import { useConnection } from "@/web/hooks/collections/use-connection";
import { useDebounce } from "@/web/hooks/use-debounce";
import { useStoreDiscovery } from "@/web/hooks/use-store-discovery";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { slugify } from "@/web/utils/slugify";
import {
  findListToolName,
  findFiltersToolName,
} from "@/web/utils/registry-utils";
import { CollectionSearch } from "../collections/collection-search";
import { MCPServerCardGrid } from "./mcp-server-card";
import { StoreFilters } from "./store-filters";
import type { RegistryItem } from "./types";

interface StoreDiscoveryProps {
  registryId: string;
}

/**
 * Filter items by search term across name and description
 * Note: Search is done client-side for instant feedback
 */
function filterItemsBySearch(
  items: RegistryItem[],
  search: string,
): RegistryItem[] {
  if (!search) return items;
  const searchLower = search.toLowerCase();
  return items.filter(
    (item) =>
      (item.name || item.title || "").toLowerCase().includes(searchLower) ||
      (item.description || item.server.description || "")
        .toLowerCase()
        .includes(searchLower),
  );
}

/**
 * Check if an item is verified
 */
function isItemVerified(item: RegistryItem): boolean {
  return item.verified === true || item._meta?.["mcp.mesh"]?.verified === true;
}

/**
 * Store discovery content - handles data display and interactions
 */
function StoreDiscoveryContent({
  registryId,
  listToolName,
  filtersToolName,
}: {
  registryId: string;
  listToolName: string;
  filtersToolName?: string;
}) {
  const [search, setSearch] = useState("");
  // Debounce search for server-side query (300ms delay to rate-limit API calls)
  const debouncedSearch = useDebounce(search, 300);
  const navigate = useNavigate();
  const { org } = useProjectContext();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    items,
    hasMore,
    isLoadingMore,
    isInitialLoading,
    isFetching,
    loadMore,
    availableTags,
    availableCategories,
    selectedTags,
    selectedCategories,
    setSelectedTags,
    setSelectedCategories,
    hasActiveFilters,
  } = useStoreDiscovery({
    registryId,
    listToolName,
    filtersToolName,
    search: debouncedSearch,
  });

  // Always apply local filter when search is active
  // This ensures instant feedback and handles keepPreviousData showing unfiltered cached data
  const filteredItems = search ? filterItemsBySearch(items, search) : items;

  // Show searching indicator when server-side search is pending or fetching
  const isSearching =
    (search !== debouncedSearch || isFetching) &&
    !isInitialLoading &&
    Boolean(search);

  // Separate verified and non-verified items
  const verifiedItems = filteredItems.filter(isItemVerified);
  const allItems = filteredItems.filter(
    (item) => !verifiedItems.find((v) => v.id === item.id),
  );

  const handleItemClick = (item: RegistryItem) => {
    const appNameSlug = slugify(
      item.name || item.title || item.server.title || "",
    );
    const serverName = item.server.name;

    navigate({
      to: "/$org/store/$appName",
      params: { org: org.slug, appName: appNameSlug },
      search: {
        registryId,
        serverName,
      },
    });
  };

  // Infinite scroll: load more when near bottom
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!hasMore || isLoadingMore) return;

    const target = e.currentTarget;
    const scrollBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight;

    // Load more when within 200px of bottom
    if (scrollBottom < 200) {
      loadMore();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <CollectionSearch
        value={search}
        onChange={setSearch}
        placeholder="Search for an MCP Server..."
        isSearching={isSearching}
      />

      {/* Filters */}
      <StoreFilters
        availableTags={availableTags}
        availableCategories={availableCategories}
        selectedTags={selectedTags}
        selectedCategories={selectedCategories}
        onTagChange={setSelectedTags}
        onCategoryChange={setSelectedCategories}
      />

      {/* Content */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        <div className="p-5">
          <div>
            {/* Initial loading state */}
            {isInitialLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Loading01
                  size={32}
                  className="animate-spin text-muted-foreground mb-4"
                />
                <p className="text-sm text-muted-foreground">
                  Loading items...
                </p>
              </div>
            ) : items.length === 0 && !hasActiveFilters ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Inbox01 size={48} className="text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No items available</h3>
                <p className="text-muted-foreground">
                  This store doesn't have any available items yet.
                </p>
              </div>
            ) : items.length === 0 && hasActiveFilters && !search ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FilterLines size={48} className="text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No matching items</h3>
                <p className="text-muted-foreground">
                  Try adjusting your filters to find more results.
                </p>
              </div>
            ) : search && filteredItems.length === 0 && !isSearching ? (
              // Only show "No results" when search is complete (not while searching)
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <SearchMd size={48} className="text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No results found</h3>
                <p className="text-muted-foreground">
                  Try adjusting your search terms.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                {/* Searching indicator when no local results yet */}
                {isSearching && filteredItems.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Loading01
                      size={32}
                      className="animate-spin text-muted-foreground mb-4"
                    />
                    <p className="text-sm text-muted-foreground">
                      Searching...
                    </p>
                  </div>
                )}

                {verifiedItems.length > 0 && (
                  <MCPServerCardGrid
                    items={verifiedItems}
                    title="Verified"
                    onItemClick={handleItemClick}
                  />
                )}

                {allItems.length > 0 && (
                  <MCPServerCardGrid
                    items={allItems}
                    title={verifiedItems.length > 0 ? "All" : ""}
                    onItemClick={handleItemClick}
                  />
                )}

                {/* Loading more indicator */}
                {hasMore && isLoadingMore && (
                  <div className="flex justify-center py-8">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loading01 size={20} className="animate-spin" />
                      <span className="text-sm">Loading more items...</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Store Discovery - main entry point
 * Discovers available tools and renders the discovery UI
 */
export function StoreDiscovery({ registryId }: StoreDiscoveryProps) {
  const registryConnection = useConnection(registryId);

  // Find the LIST tool from the registry connection
  const listToolName = findListToolName(registryConnection?.tools);
  if (!listToolName) {
    throw new Error("This registry does not support listing store items.");
  }

  // Find the FILTERS tool (optional - not all registries support it)
  const filtersToolName = findFiltersToolName(registryConnection?.tools);

  return (
    <StoreDiscoveryContent
      registryId={registryId}
      listToolName={listToolName}
      filtersToolName={filtersToolName || undefined}
    />
  );
}

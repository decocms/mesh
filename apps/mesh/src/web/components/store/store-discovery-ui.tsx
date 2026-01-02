import { useProjectContext } from "@/web/providers/project-context-provider";
import { slugify } from "@/web/utils/slugify";
import { Inbox01, SearchMd, Loading01, FilterLines } from "@untitledui/icons";
import { useNavigate } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { CollectionSearch } from "../collections/collection-search";
import {
  type RegistryItem,
  RegistryItemsSection,
} from "./registry-items-section";
import { StoreFilters } from "./store-filters";
import type { FilterItem } from "./store-discovery";

/**
 * Filter items by search term across name and description
 * Note: Search is still done client-side for instant feedback
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
  return (
    item.verified === true ||
    item._meta?.["mcp.mesh"]?.verified === true ||
    item.server._meta?.["mcp.mesh"]?.verified === true
  );
}

/**
 * Search params for store app detail route
 */
interface StoreAppDetailSearchParams {
  registryId: string;
  serverName: string;
}

interface StoreDiscoveryUIProps {
  items: RegistryItem[];
  isLoadingMore?: boolean;
  isFiltering?: boolean;
  registryId: string;
  hasMore?: boolean;
  onLoadMore?: () => void;
  totalCount?: number | null;
  availableTags?: FilterItem[];
  availableCategories?: FilterItem[];
  selectedTags: string[];
  selectedCategories: string[];
  onTagChange: (tags: string[]) => void;
  onCategoryChange: (categories: string[]) => void;
}

export function StoreDiscoveryUI({
  items,
  isLoadingMore = false,
  isFiltering = false,
  registryId,
  hasMore = false,
  onLoadMore,
  availableTags,
  availableCategories,
  selectedTags,
  selectedCategories,
  onTagChange,
  onCategoryChange,
}: StoreDiscoveryUIProps) {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { org } = useProjectContext();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Only apply local search filter - tags/categories are filtered by API
  const filteredItems = filterItemsBySearch(items, search);

  // Verified items
  const verifiedItems = filteredItems.filter(isItemVerified);

  // Non-verified items
  const allItems = filteredItems.filter(
    (item) => !verifiedItems.find((v) => v.id === item.id),
  );

  const hasActiveFilters = selectedTags.length > 0 || selectedCategories.length > 0;

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
      } satisfies StoreAppDetailSearchParams,
    });
  };

  // Infinite scroll: load more when near bottom
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!hasMore || !onLoadMore || search || isLoadingMore) return;

    const target = e.currentTarget;
    const scrollBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight;

    // Load more when within 200px of bottom
    if (scrollBottom < 200) {
      onLoadMore();
    }
  };

  // Main list view
  return (
    <div className="flex flex-col h-full">
      <CollectionSearch
        value={search}
        onChange={setSearch}
        placeholder="Search for an MCP Server..."
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setSearch(e.currentTarget.value);
          }
        }}
      />

      {/* Filters */}
      <StoreFilters
        availableTags={availableTags}
        availableCategories={availableCategories}
        selectedTags={selectedTags}
        selectedCategories={selectedCategories}
        onTagChange={onTagChange}
        onCategoryChange={onCategoryChange}
      />

      {/* Content */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        <div className="p-5">
          <div>
            {/* Loading state when filtering */}
            {isFiltering ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Loading01 size={32} className="animate-spin text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">
                  Filtering results...
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
            ) : items.length === 0 && hasActiveFilters ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FilterLines size={48} className="text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No matching items</h3>
                <p className="text-muted-foreground">
                  Try adjusting your filters to find more results.
                </p>
              </div>
            ) : search && filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <SearchMd size={48} className="text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No results found</h3>
                <p className="text-muted-foreground">
                  Try adjusting your search terms.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                {verifiedItems.length > 0 && (
                  <RegistryItemsSection
                    items={verifiedItems}
                    title="Verified"
                    onItemClick={handleItemClick}
                  />
                )}

                {allItems.length > 0 && (
                  <RegistryItemsSection
                    items={allItems}
                    title={verifiedItems.length > 0 ? "All" : ""}
                    onItemClick={handleItemClick}
                  />
                )}

                {/* Loading indicator */}
                {hasMore && !search && isLoadingMore && (
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

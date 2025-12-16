import { useProjectContext } from "@/web/providers/project-context-provider";
import { slugify } from "@/web/utils/slugify";
import { Icon } from "@deco/ui/components/icon.tsx";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState, useRef } from "react";
import { CollectionSearch } from "../collections/collection-search";
import {
  type RegistryItem,
  RegistryItemsSection,
} from "./registry-items-section";

/**
 * Filter items by search term across name and description
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
      (item.description || item.server?.description || "")
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
    item.server?._meta?.["mcp.mesh"]?.verified === true
  );
}

interface StoreDiscoveryUIProps {
  items: RegistryItem[];
  isLoading: boolean;
  isLoadingMore?: boolean;
  error: Error | null;
  registryId: string;
  hasMore?: boolean;
  onLoadMore?: () => void;
  totalCount?: number | null;
}

export function StoreDiscoveryUI({
  items,
  isLoading,
  isLoadingMore = false,
  error,
  registryId,
  hasMore = false,
  onLoadMore,
  totalCount,
}: StoreDiscoveryUIProps) {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { org } = useProjectContext();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Filtered items based on search
  const filteredItems = filterItemsBySearch(items, search);

  // Verified items
  const verifiedItems = filteredItems.filter(isItemVerified);

  // Non-verified items
  const allItems = filteredItems.filter(
    (item) => !verifiedItems.find((v) => v.id === item.id),
  );

  const handleItemClick = (item: RegistryItem) => {
    const itemName = item.name || item.title || item.server?.title || "";
    const appNameSlug = slugify(itemName);
    navigate({
      to: "/$org/store/$appName",
      params: { org: org.slug, appName: appNameSlug },
      search: {
        registryId,
        serverName: item.server?.name || itemName,
        itemId: item.id,
      } as any,
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
  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">Loading store items...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Icon name="error" size={48} className="text-destructive mb-4" />
        <h3 className="text-lg font-medium mb-2">Error loading store</h3>
        <p className="text-muted-foreground max-w-md text-center">
          {error instanceof Error ? error.message : "Unknown error occurred"}
        </p>
      </div>
    );
  }

  // Main list view
  return (
    <div className="flex flex-col h-full">
      <CollectionSearch
        value={search}
        onChange={setSearch}
        placeholder="Search for a MCP..."
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setSearch(e.currentTarget.value);
          }
        }}
      />

      {/* Content */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        <div className="p-5">
          <div>
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Icon
                  name="inbox"
                  size={48}
                  className="text-muted-foreground mb-4"
                />
                <h3 className="text-lg font-medium mb-2">No items available</h3>
                <p className="text-muted-foreground">
                  This store doesn't have any available items yet.
                </p>
              </div>
            ) : search && filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Icon
                  name="search"
                  size={48}
                  className="text-muted-foreground mb-4"
                />
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
                    title="All"
                    onItemClick={handleItemClick}
                    totalCount={totalCount}
                  />
                )}

                {/* Loading indicator */}
                {hasMore && !search && isLoadingMore && (
                  <div className="flex justify-center py-8">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
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

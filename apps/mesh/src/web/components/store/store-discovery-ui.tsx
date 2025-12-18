import { useProjectContext } from "@/web/providers/project-context-provider";
import { slugify } from "@/web/utils/slugify";
import { Icon } from "@deco/ui/components/icon.tsx";
import { useNavigate } from "@tanstack/react-router";
import { useRef } from "react";
import { CollectionSearch } from "../collections/collection-search";
import {
  type RegistryItem,
  RegistryItemsSection,
} from "./registry-items-section";

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
  isLoadingMore?: boolean;
  registryId: string;
  hasMore?: boolean;
  onLoadMore?: () => void;
  totalCount?: number | null;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  isSearchPending?: boolean;
}

export function StoreDiscoveryUI({
  items,
  isLoadingMore = false,
  registryId,
  hasMore = false,
  onLoadMore,
  totalCount,
  searchTerm,
  onSearchChange,
  isSearchPending = false,
}: StoreDiscoveryUIProps) {
  const navigate = useNavigate();
  const { org } = useProjectContext();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Verified items
  const verifiedItems = items.filter(isItemVerified);

  // Non-verified items
  const allItems = items.filter(
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
    if (!hasMore || !onLoadMore || searchTerm || isLoadingMore) return;

    const target = e.currentTarget;
    const scrollBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight;

    // Load more when within 200px of bottom
    if (scrollBottom < 200) {
      onLoadMore();
    }
  };

  // Show loading when search is pending (debounce in progress) or fetching
  const showSearchLoading = isSearchPending && searchTerm.length > 0;

  // Main list view
  return (
    <div className="flex flex-col h-full">
      <CollectionSearch
        value={searchTerm}
        onChange={onSearchChange}
        placeholder="Search for a MCP..."
      />

      {/* Content */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        <div className="p-5">
          <div>
            {showSearchLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Icon
                  name="progress_activity"
                  size={48}
                  className="text-muted-foreground mb-4 animate-spin"
                />
                <h3 className="text-lg font-medium mb-2">Searching...</h3>
                <p className="text-muted-foreground">
                  Looking for "{searchTerm}"
                </p>
              </div>
            ) : items.length === 0 && !searchTerm ? (
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
            ) : searchTerm && items.length === 0 ? (
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
                {hasMore && !searchTerm && isLoadingMore && (
                  <div className="flex justify-center py-8">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Icon
                        name="progress_activity"
                        size={20}
                        className="animate-spin"
                      />
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

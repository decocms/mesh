import { CollectionDisplayButton } from "@/web/components/collections/collection-display-button.tsx";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { CollectionTableWrapper } from "@/web/components/collections/collection-table-wrapper.tsx";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { Card } from "@deco/ui/components/card.tsx";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ViewActions } from "@/web/components/details/layout";

export interface Tool {
  name: string;
  description?: string;
}

export interface ToolsListProps {
  /** Array of tools to display */
  tools: Tool[] | undefined;
  /** Connection ID for navigation */
  connectionId?: string;
  /** Organization slug for navigation */
  org?: string;
  /** Custom click handler - if provided, overrides default navigation */
  onToolClick?: (tool: Tool) => void;
  /** Whether to show the ViewActions toolbar (default: true) */
  showToolbar?: boolean;
  /** Custom empty state message */
  emptyMessage?: string;
}

/**
 * Shared component for displaying a list of tools with search, sort, and view modes.
 * Can be used in both connection-detail and store-app-detail pages.
 */
export function ToolsList({
  tools,
  connectionId,
  org,
  onToolClick,
  showToolbar = true,
  emptyMessage = "This connection doesn't have any tools yet.",
}: ToolsListProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [sortKey, setSortKey] = useState<string | undefined>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(
    "asc",
  );

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) =>
        prev === "asc" ? "desc" : prev === "desc" ? null : "asc",
      );
      if (sortDirection === "desc") setSortKey(undefined);
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const handleToolClick = (tool: Tool) => {
    if (onToolClick) {
      onToolClick(tool);
    } else if (connectionId && org) {
      navigate({
        to: "/$org/mcps/$connectionId/$collectionName/$itemId",
        params: {
          org: org,
          connectionId: connectionId,
          collectionName: "tools",
          itemId: encodeURIComponent(tool.name),
        },
      });
    }
  };

  const filteredTools =
    !tools || tools.length === 0
      ? []
      : !search.trim()
        ? tools
        : (() => {
            const searchLower = search.toLowerCase();
            return tools.filter(
              (t) =>
                t.name.toLowerCase().includes(searchLower) ||
                (t.description &&
                  t.description.toLowerCase().includes(searchLower)),
            );
          })();

  const sortedTools =
    !sortKey || !sortDirection
      ? filteredTools
      : [...filteredTools].sort((a, b) => {
          const aVal = (a as unknown as Record<string, unknown>)[sortKey] || "";
          const bVal = (b as unknown as Record<string, unknown>)[sortKey] || "";
          const comparison = String(aVal).localeCompare(String(bVal));
          return sortDirection === "asc" ? comparison : -comparison;
        });

  const columns = [
    {
      id: "name",
      header: "Name",
      render: (tool: Tool) => (
        <span className="text-sm font-medium font-mono text-foreground">
          {tool.name}
        </span>
      ),
      sortable: true,
    },
    {
      id: "description",
      header: "Description",
      render: (tool: Tool) => (
        <span className="text-sm text-foreground">
          {tool.description || "—"}
        </span>
      ),
      cellClassName: "flex-1",
      sortable: true,
    },
  ];

  const sortOptions = columns
    .filter((col) => col.sortable)
    .map((col) => ({
      id: col.id,
      label: typeof col.header === "string" ? col.header : col.id,
    }));

  return (
    <>
      {showToolbar && (
        <ViewActions>
          <CollectionDisplayButton
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
            sortOptions={sortOptions}
          />
        </ViewActions>
      )}

      <div className="flex flex-col h-full overflow-hidden">
        {/* Search */}
        <CollectionSearch
          value={search}
          onChange={setSearch}
          placeholder="Search tools..."
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setSearch("");
              (event.target as HTMLInputElement).blur();
            }
          }}
        />

        {/* Content: Cards or Table */}
        {viewMode === "cards" ? (
          <div className="flex-1 overflow-auto p-5">
            {sortedTools.length === 0 ? (
              <EmptyState
                image={null}
                title={search ? "No tools found" : "No tools available"}
                description={
                  search ? "Try adjusting your search terms" : emptyMessage
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {sortedTools.map((tool) => (
                  <Card
                    key={tool.name}
                    className="cursor-pointer transition-colors"
                    onClick={() => handleToolClick(tool)}
                  >
                    <div className="flex flex-col gap-4 p-6">
                      <IntegrationIcon
                        icon={null}
                        name={tool.name}
                        size="md"
                        className="shrink-0 shadow-sm"
                      />
                      <div className="flex flex-col gap-0">
                        <h3 className="text-base font-medium text-foreground truncate">
                          {tool.name}
                        </h3>
                        <p className="text-base text-muted-foreground line-clamp-2">
                          {tool.description || "No description"}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          <CollectionTableWrapper
            columns={columns}
            data={sortedTools}
            isLoading={false}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
            onRowClick={(tool: Tool) => handleToolClick(tool)}
            emptyState={
              <EmptyState
                image={null}
                title={search ? "No tools found" : "No tools available"}
                description={
                  search ? "Try adjusting your search terms" : emptyMessage
                }
              />
            }
          />
        )}
      </div>
    </>
  );
}

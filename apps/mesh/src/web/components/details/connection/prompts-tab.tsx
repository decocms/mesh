import { CollectionDisplayButton } from "@/web/components/collections/collection-display-button.tsx";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { CollectionTableWrapper } from "@/web/components/collections/collection-table-wrapper.tsx";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { PinToSidebarButton } from "@/web/components/pin-to-sidebar-button";
import { useConnection } from "@/web/hooks/collections/use-connection";
import { Card } from "@deco/ui/components/card.tsx";
import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { ViewActions } from "@/web/components/details/layout";
import type { McpPrompt } from "@/web/hooks/use-connection-prompts";
import { useToolboxNavigation } from "@/web/hooks/use-toolbox-navigation";

export interface PromptsListProps {
  /** Array of prompts to display */
  prompts: McpPrompt[] | undefined;
  /** Connection ID for navigation */
  connectionId?: string;
  /** Organization slug for navigation */
  org?: string;
  /** Connection title for display */
  connectionTitle?: string;
  /** Connection icon for pinning */
  connectionIcon?: string | null;
  /** Custom click handler - if provided, overrides default navigation */
  onPromptClick?: (prompt: McpPrompt) => void;
  /** Whether to show the ViewActions toolbar (default: true) */
  showToolbar?: boolean;
  /** Custom empty state message */
  emptyMessage?: string;
}

/**
 * Shared component for displaying a list of prompts with search, sort, and view modes.
 */
function PromptsList({
  prompts,
  connectionId,
  org,
  connectionTitle,
  connectionIcon,
  onPromptClick,
  showToolbar = true,
  emptyMessage = "This connection doesn't have any prompts yet.",
}: PromptsListProps) {
  const { navigateToCollectionDetail } = useToolboxNavigation();
  const routerState = useRouterState();
  const url = routerState.location.href;
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

  const handlePromptClick = (prompt: McpPrompt) => {
    if (onPromptClick) {
      onPromptClick(prompt);
    } else if (connectionId && org) {
      navigateToCollectionDetail({
        connectionId,
        collectionName: "prompts",
        itemId: encodeURIComponent(prompt.name),
      });
    }
  };

  const filteredPrompts =
    !prompts || prompts.length === 0
      ? []
      : !search.trim()
        ? prompts
        : (() => {
            const searchLower = search.toLowerCase();
            return prompts.filter(
              (p) =>
                p.name.toLowerCase().includes(searchLower) ||
                (p.description &&
                  p.description.toLowerCase().includes(searchLower)),
            );
          })();

  const sortedPrompts =
    !sortKey || !sortDirection
      ? filteredPrompts
      : [...filteredPrompts].sort((a, b) => {
          const aVal = (a as unknown as Record<string, unknown>)[sortKey] || "";
          const bVal = (b as unknown as Record<string, unknown>)[sortKey] || "";
          const comparison = String(aVal).localeCompare(String(bVal));
          return sortDirection === "asc" ? comparison : -comparison;
        });

  const columns = [
    {
      id: "name",
      header: "Name",
      render: (prompt: McpPrompt) => (
        <span className="text-sm font-medium font-mono text-foreground">
          {prompt.name}
        </span>
      ),
      sortable: true,
    },
    {
      id: "description",
      header: "Description",
      render: (prompt: McpPrompt) => (
        <span className="text-sm text-foreground">
          {prompt.description || "—"}
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
          <PinToSidebarButton
            title={connectionTitle ? `${connectionTitle}: Prompts` : "Prompts"}
            url={url}
            icon={connectionIcon ?? "description"}
          />
        </ViewActions>
      )}

      <div className="flex flex-col h-full overflow-hidden">
        {/* Search */}
        <CollectionSearch
          value={search}
          onChange={setSearch}
          placeholder="Search prompts..."
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
            {sortedPrompts.length === 0 ? (
              <EmptyState
                image={null}
                title={search ? "No prompts found" : "No prompts available"}
                description={
                  search ? "Try adjusting your search terms" : emptyMessage
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {sortedPrompts.map((prompt) => (
                  <Card
                    key={prompt.name}
                    className="cursor-pointer transition-colors"
                    onClick={() => handlePromptClick(prompt)}
                  >
                    <div className="flex flex-col gap-4 p-6">
                      <IntegrationIcon
                        icon={null}
                        name={prompt.name}
                        size="md"
                        className="shrink-0 shadow-sm"
                      />
                      <div className="flex flex-col gap-0">
                        <h3 className="text-base font-medium text-foreground truncate">
                          {prompt.name}
                        </h3>
                        <p className="text-base text-muted-foreground line-clamp-2">
                          {prompt.description || "No description"}
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
            data={sortedPrompts}
            isLoading={false}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
            onRowClick={(prompt: McpPrompt) => handlePromptClick(prompt)}
            emptyState={
              <EmptyState
                image={null}
                title={search ? "No prompts found" : "No prompts available"}
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

interface PromptsTabProps {
  prompts: McpPrompt[] | undefined;
  connectionId: string;
  org: string;
}

export function PromptsTab({ prompts, connectionId, org }: PromptsTabProps) {
  const connection = useConnection(connectionId);

  return (
    <PromptsList
      prompts={prompts}
      connectionId={connectionId}
      org={org}
      connectionTitle={connection?.title}
      connectionIcon={connection?.icon}
    />
  );
}

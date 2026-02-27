import { isUIResourceUri, MCP_APP_DISPLAY_MODES } from "@/mcp-apps/types.ts";
import { MCPAppRenderer } from "@/mcp-apps/mcp-app-renderer.tsx";
import { getUIWidgetResource } from "@/tools/ui-widgets/resources.ts";
import { useUIResourceLoader } from "@/web/components/chat/message/parts/use-ui-resource-loader.ts";
import { CollectionDisplayButton } from "@/web/components/collections/collection-display-button.tsx";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { CollectionTableWrapper } from "@/web/components/collections/collection-table-wrapper.tsx";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { PinToSidebarButton } from "@/web/components/pin-to-sidebar-button";
import { ViewActions } from "@/web/components/details/layout";
import { useConnection, useMCPClient } from "@decocms/mesh-sdk";
import { Card } from "@deco/ui/components/card.tsx";
import { useRouterState } from "@tanstack/react-router";
import { LayersTwo01, XClose } from "@untitledui/icons";
import { Suspense, useState } from "react";
import type {
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";

/** Resource type for display - compatible with MCP Resource but with optional name */
interface McpResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface ResourcesListProps {
  /** Array of resources to display */
  resources: McpResource[] | undefined;
  /** Connection ID for context */
  connectionId?: string;
  /** Organization slug for context */
  org?: string;
  /** Connection title for display */
  connectionTitle?: string;
  /** Connection icon for pinning */
  connectionIcon?: string | null;
  /** Custom click handler */
  onResourceClick?: (resource: McpResource) => void;
  /** Whether to show the ViewActions toolbar (default: true) */
  showToolbar?: boolean;
  /** Custom empty state message */
  emptyMessage?: string;
}

/**
 * Shared component for displaying a list of resources with search, sort, and view modes.
 */
function ResourcesList({
  resources,
  connectionTitle,
  connectionIcon,
  onResourceClick,
  showToolbar = true,
  emptyMessage = "This connection doesn't have any resources yet.",
}: ResourcesListProps) {
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

  const handleResourceClick = (resource: McpResource) => {
    if (onResourceClick) {
      onResourceClick(resource);
    }
  };

  const filteredResources =
    !resources || resources.length === 0
      ? []
      : !search.trim()
        ? resources
        : (() => {
            const searchLower = search.toLowerCase();
            return resources.filter(
              (r) =>
                r.uri.toLowerCase().includes(searchLower) ||
                (r.name && r.name.toLowerCase().includes(searchLower)) ||
                (r.description &&
                  r.description.toLowerCase().includes(searchLower)),
            );
          })();

  const sortedResources =
    !sortKey || !sortDirection
      ? filteredResources
      : [...filteredResources].sort((a, b) => {
          const aVal = (a as unknown as Record<string, unknown>)[sortKey] || "";
          const bVal = (b as unknown as Record<string, unknown>)[sortKey] || "";
          const comparison = String(aVal).localeCompare(String(bVal));
          return sortDirection === "asc" ? comparison : -comparison;
        });

  const columns = [
    {
      id: "name",
      header: "Name",
      render: (resource: McpResource) => (
        <span className="text-sm font-medium text-foreground">
          {resource.name || resource.uri}
        </span>
      ),
      sortable: true,
    },
    {
      id: "uri",
      header: "URI",
      render: (resource: McpResource) => (
        <span className="text-sm font-mono text-muted-foreground">
          {resource.uri}
        </span>
      ),
      sortable: true,
    },
    {
      id: "description",
      header: "Description",
      render: (resource: McpResource) => (
        <span className="text-sm text-foreground">
          {resource.description || "—"}
        </span>
      ),
      cellClassName: "flex-1",
      sortable: true,
    },
    {
      id: "mimeType",
      header: "Type",
      render: (resource: McpResource) => (
        <span className="text-sm text-muted-foreground">
          {resource.mimeType || "—"}
        </span>
      ),
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
            title={
              connectionTitle ? `${connectionTitle}: Resources` : "Resources"
            }
            url={url}
            icon={connectionIcon ?? "folder"}
          />
        </ViewActions>
      )}

      <div className="flex flex-col h-full overflow-hidden">
        {/* Search */}
        <CollectionSearch
          value={search}
          onChange={setSearch}
          placeholder="Search resources..."
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
            {sortedResources.length === 0 ? (
              <EmptyState
                image={null}
                title={search ? "No resources found" : "No resources available"}
                description={
                  search ? "Try adjusting your search terms" : emptyMessage
                }
              />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
                {sortedResources.map((resource) => (
                  <Card
                    key={resource.uri}
                    className="cursor-pointer transition-colors"
                    onClick={() => handleResourceClick(resource)}
                  >
                    <div className="flex flex-col gap-4 p-6">
                      <IntegrationIcon
                        icon={null}
                        name={resource.name || resource.uri}
                        size="md"
                        className="shrink-0 shadow-sm"
                      />
                      <div className="flex flex-col gap-1">
                        <h3 className="text-base font-medium text-foreground truncate">
                          {resource.name || resource.uri}
                        </h3>
                        <p className="text-xs font-mono text-muted-foreground truncate">
                          {resource.uri}
                        </p>
                        {resource.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {resource.description}
                          </p>
                        )}
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
            data={sortedResources}
            isLoading={false}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onSort={handleSort}
            onRowClick={(resource: McpResource) =>
              handleResourceClick(resource)
            }
            emptyState={
              <EmptyState
                image={null}
                title={search ? "No resources found" : "No resources available"}
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

function UIAppsSection({
  uiResources,
  onAppClick,
}: {
  uiResources: McpResource[];
  onAppClick: (resource: McpResource) => void;
}) {
  if (uiResources.length === 0) return null;

  return (
    <div className="border-b border-border pb-4 mb-4">
      <div className="flex items-center gap-2 mb-3 px-5 pt-4">
        <LayersTwo01 className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-foreground">UI Apps</h3>
        <span className="text-xs text-muted-foreground">
          ({uiResources.length})
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 px-5">
        {uiResources.map((resource) => (
          <Card
            key={resource.uri}
            className="cursor-pointer transition-colors hover:bg-accent/50"
            onClick={() => onAppClick(resource)}
          >
            <div className="flex flex-col gap-2 p-4">
              <div className="flex items-center gap-2">
                <LayersTwo01 className="size-4 text-primary" />
                <span className="text-sm font-medium text-foreground truncate">
                  {resource.name || resource.uri.replace("ui://mesh/", "")}
                </span>
              </div>
              {resource.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {resource.description}
                </p>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function UIAppPreview({
  resource,
  connectionId,
  orgId,
  onClose,
}: {
  resource: McpResource;
  connectionId: string;
  orgId: string;
  onClose: () => void;
}) {
  const mcpClient = useMCPClient({ connectionId, orgId });

  const handleReadResource = async (
    uri: string,
  ): Promise<ReadResourceResult> => {
    const result = await mcpClient.readResource({ uri });
    return result as ReadResourceResult;
  };

  const handleCallTool = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> => {
    const result = await mcpClient.callTool({ name, arguments: args });
    return result as CallToolResult;
  };

  const { html, loading, error } = useUIResourceLoader(
    resource.uri,
    handleReadResource,
  );

  const exampleInput = getUIWidgetResource(resource.uri)?.exampleInput;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <LayersTwo01 className="size-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">
            {resource.name || resource.uri.replace("ui://mesh/", "")}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <XClose className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-5">
        {loading && (
          <div className="flex items-center justify-center h-48">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading app...</span>
            </div>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-48 text-destructive">
            <span className="text-sm">Failed to load app: {error}</span>
          </div>
        )}
        {html && (
          <MCPAppRenderer
            html={html}
            uri={resource.uri}
            displayMode="fullscreen"
            minHeight={MCP_APP_DISPLAY_MODES.view.minHeight}
            maxHeight={MCP_APP_DISPLAY_MODES.view.maxHeight}
            callTool={handleCallTool}
            readResource={handleReadResource}
            toolInput={exampleInput}
            className="border border-border rounded-lg"
          />
        )}
      </div>
    </div>
  );
}

interface ResourcesTabProps {
  resources: McpResource[] | undefined;
  connectionId: string;
  org: string;
}

export function ResourcesTab({
  resources,
  connectionId,
  org,
}: ResourcesTabProps) {
  const connection = useConnection(connectionId);
  const [previewApp, setPreviewApp] = useState<McpResource | null>(null);

  const uiResources = resources?.filter((r) => isUIResourceUri(r.uri)) ?? [];
  const regularResources =
    resources?.filter((r) => !isUIResourceUri(r.uri)) ?? [];

  if (previewApp) {
    return (
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-48">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          </div>
        }
      >
        <UIAppPreview
          resource={previewApp}
          connectionId={connectionId}
          orgId={org}
          onClose={() => setPreviewApp(null)}
        />
      </Suspense>
    );
  }

  return (
    <>
      {uiResources.length > 0 && (
        <UIAppsSection uiResources={uiResources} onAppClick={setPreviewApp} />
      )}
      <ResourcesList
        resources={regularResources}
        connectionId={connectionId}
        org={org}
        connectionTitle={connection?.title}
        connectionIcon={connection?.icon}
        emptyMessage={
          uiResources.length > 0
            ? "No other resources available."
            : "This connection doesn't have any resources yet."
        }
      />
    </>
  );
}

/**
 * Toolbox Connections Page
 *
 * Shows connections included in this toolbox using the same collection pattern
 * as org connections. Click to see detail, add from org connections via modal.
 */

import type { ConnectionEntity } from "@/tools/connection/schema";
import { AddConnectionModal } from "@/web/components/add-connection-modal";
import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { CollectionTableWrapper } from "@/web/components/collections/collection-table-wrapper.tsx";
import { ConnectionCard } from "@/web/components/connections/connection-card.tsx";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useGatewayActions } from "@/web/hooks/collections/use-gateway";
import { useListState } from "@/web/hooks/use-list-state";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { useToolboxContext } from "@/web/providers/toolbox-context-provider";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { type TableColumn } from "@deco/ui/components/collection-table.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import {
  DotsVertical,
  Eye,
  Trash01,
  Loading01,
  Container,
  Plus,
  Building02,
} from "@untitledui/icons";
import { useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { toast } from "sonner";

// ============================================================================
// Main Content
// ============================================================================

function ToolboxConnectionsContent() {
  const { toolbox } = useToolboxContext();
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const allConnections = useConnections({});
  const actions = useGatewayActions();
  const [showAddModal, setShowAddModal] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Get connections currently in toolbox
  const toolboxConnectionIds = new Set(
    toolbox.connections.map((c) => c.connection_id),
  );

  // Filter all connections to only those in this toolbox
  const toolboxConnections = allConnections.filter((c) =>
    toolboxConnectionIds.has(c.id),
  );

  // Available to add = in org but not in toolbox
  const availableConnections = allConnections.filter(
    (c) => !toolboxConnectionIds.has(c.id),
  );

  // List state for search/sort/view mode
  const listState = useListState<ConnectionEntity>({
    namespace: `${org.slug}-toolbox-${toolbox.id}`,
    resource: "toolbox-connections",
  });

  // Apply search filter
  const filteredConnections = toolboxConnections.filter((c) => {
    if (!listState.search) return true;
    const q = listState.search.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q)
    );
  });

  // Apply sorting
  const sortedConnections = [...filteredConnections].sort((a, b) => {
    const key = listState.sortKey as keyof ConnectionEntity;
    const aVal = a[key] ?? "";
    const bVal = b[key] ?? "";
    const cmp = String(aVal).localeCompare(String(bVal));
    return listState.sortDirection === "asc" ? cmp : -cmp;
  });

  const handleRemoveConnection = async (connectionId: string) => {
    const newConnections = toolbox.connections.filter(
      (c) => c.connection_id !== connectionId,
    );

    try {
      await actions.update.mutateAsync({
        id: toolbox.id,
        data: { connections: newConnections },
      });
      toast.success("Connection removed from toolbox");
    } catch {
      toast.error("Failed to remove connection");
    }
  };

  const handleAddConnections = async (connectionIds: string[]) => {
    setIsAdding(true);

    const newConnections = [
      ...toolbox.connections,
      ...connectionIds.map((id) => ({
        connection_id: id,
        selected_tools: null,
        selected_resources: null,
        selected_prompts: null,
      })),
    ];

    try {
      await actions.update.mutateAsync({
        id: toolbox.id,
        data: { connections: newConnections },
      });
      toast.success(
        `Added ${connectionIds.length} connection${connectionIds.length > 1 ? "s" : ""}`,
      );
      setShowAddModal(false);
    } catch {
      toast.error("Failed to add connections");
    } finally {
      setIsAdding(false);
    }
  };

  const handleBrowseStore = () => {
    navigate({
      to: "/$org/store",
      params: { org: org.slug },
    });
  };

  const columns: TableColumn<ConnectionEntity>[] = [
    {
      id: "icon",
      header: "",
      render: (connection) => (
        <IntegrationIcon
          icon={connection.icon}
          name={connection.title}
          size="sm"
          className="shrink-0 shadow-sm"
          fallbackIcon={<Container />}
        />
      ),
      cellClassName: "w-16 shrink-0",
      wrap: true,
    },
    {
      id: "title",
      header: "Name",
      render: (connection) => (
        <span className="text-sm font-medium text-foreground truncate">
          {connection.title}
        </span>
      ),
      cellClassName: "w-48 min-w-0 shrink-0",
      sortable: true,
    },
    {
      id: "description",
      header: "Description",
      render: (connection) => (
        <span className="text-sm text-foreground line-clamp-2">
          {connection.description || "—"}
        </span>
      ),
      cellClassName: "flex-1 min-w-0",
      wrap: true,
      sortable: true,
    },
    {
      id: "tools",
      header: "Tools",
      render: (connection) => (
        <Badge variant="secondary">{connection.tools?.length ?? 0}</Badge>
      ),
      cellClassName: "w-20 shrink-0",
    },
    {
      id: "status",
      header: "Status",
      render: (connection) => (
        <Badge variant={connection.status === "active" ? "success" : "outline"}>
          {connection.status}
        </Badge>
      ),
      cellClassName: "w-24 shrink-0",
      sortable: true,
    },
    {
      id: "actions",
      header: "",
      render: (connection) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={(e) => e.stopPropagation()}
            >
              <DotsVertical size={20} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                navigate({
                  to: "/$org/mcps/$connectionId",
                  params: { org: org.slug, connectionId: connection.id },
                });
              }}
            >
              <Eye size={16} />
              Inspect
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveConnection(connection.id);
              }}
            >
              <Trash01 size={16} />
              Remove from Toolbox
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      cellClassName: "w-12 shrink-0",
    },
  ];

  const ctaButton = (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleBrowseStore}>
        <Building02 size={16} />
        Browse Store
      </Button>
      <Button size="sm" onClick={() => setShowAddModal(true)}>
        <Plus size={16} />
        Add Connection
      </Button>
    </div>
  );

  return (
    <CollectionPage>
      <AddConnectionModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        availableConnections={availableConnections}
        onAdd={handleAddConnections}
        isLoading={isAdding}
      />

      <CollectionHeader
        title="Connections"
        viewMode={listState.viewMode}
        onViewModeChange={listState.setViewMode}
        sortKey={listState.sortKey}
        sortDirection={listState.sortDirection}
        onSort={listState.handleSort}
        sortOptions={[
          { id: "title", label: "Name" },
          { id: "description", label: "Description" },
          { id: "status", label: "Status" },
        ]}
        ctaButton={ctaButton}
      />

      <CollectionSearch
        value={listState.search}
        onChange={listState.setSearch}
        placeholder="Search connections..."
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            listState.setSearch("");
            (event.target as HTMLInputElement).blur();
          }
        }}
      />

      {listState.viewMode === "cards" ? (
        <div className="flex-1 overflow-auto p-5">
          {sortedConnections.length === 0 ? (
            <EmptyState
              image={
                <img
                  src="/emptystate-mcp.svg"
                  alt=""
                  width={336}
                  height={320}
                  aria-hidden="true"
                />
              }
              title={
                listState.search
                  ? "No connections found"
                  : "No connections in this toolbox"
              }
              description={
                listState.search
                  ? `No connections match "${listState.search}"`
                  : "Add connections to expose their tools in this toolbox."
              }
              actions={
                !listState.search && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleBrowseStore}>
                      <Building02 size={16} />
                      Browse Store
                    </Button>
                    <Button onClick={() => setShowAddModal(true)}>
                      <Plus size={16} />
                      Add Connection
                    </Button>
                  </div>
                )
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {sortedConnections.map((connection) => (
                <ConnectionCard
                  key={connection.id}
                  connection={connection}
                  fallbackIcon={<Container />}
                  onClick={() =>
                    navigate({
                      to: "/$org/mcps/$connectionId",
                      params: { org: org.slug, connectionId: connection.id },
                    })
                  }
                  headerActions={
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DotsVertical size={20} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate({
                              to: "/$org/mcps/$connectionId",
                              params: {
                                org: org.slug,
                                connectionId: connection.id,
                              },
                            });
                          }}
                        >
                          <Eye size={16} />
                          Inspect
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveConnection(connection.id);
                          }}
                        >
                          <Trash01 size={16} />
                          Remove from Toolbox
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <CollectionTableWrapper
          columns={columns}
          data={sortedConnections}
          isLoading={false}
          sortKey={listState.sortKey}
          sortDirection={listState.sortDirection}
          onSort={listState.handleSort}
          onRowClick={(connection) =>
            navigate({
              to: "/$org/mcps/$connectionId",
              params: { org: org.slug, connectionId: connection.id },
            })
          }
          emptyState={
            listState.search ? (
              <EmptyState
                image={
                  <img
                    src="/emptystate-mcp.svg"
                    alt=""
                    width={400}
                    height={178}
                    aria-hidden="true"
                  />
                }
                title="No connections found"
                description={`No connections match "${listState.search}"`}
              />
            ) : (
              <EmptyState
                image={
                  <img
                    src="/emptystate-mcp.svg"
                    alt=""
                    width={400}
                    height={178}
                    aria-hidden="true"
                  />
                }
                title="No connections in this toolbox"
                description="Add connections to expose their tools in this toolbox."
                actions={
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleBrowseStore}>
                      <Building02 size={16} />
                      Browse Store
                    </Button>
                    <Button onClick={() => setShowAddModal(true)}>
                      <Plus size={16} />
                      Add Connection
                    </Button>
                  </div>
                }
              />
            )
          }
        />
      )}
    </CollectionPage>
  );
}

export default function ToolboxConnections() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Loading01
              size={32}
              className="animate-spin text-muted-foreground"
            />
          </div>
        }
      >
        <ToolboxConnectionsContent />
      </Suspense>
    </ErrorBoundary>
  );
}

import type { GatewayEntity } from "@/tools/gateway/schema";
import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { CollectionTableWrapper } from "@/web/components/collections/collection-table-wrapper.tsx";
import { ConnectionCard } from "@/web/components/connections/connection-card.tsx";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { FolderSidebar } from "@/web/components/folder-sidebar.tsx";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import {
  useGateways,
  useGatewayActions,
} from "@/web/hooks/collections/use-gateway";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useFolders } from "@/web/hooks/collections/use-folder";
import { useListState } from "@/web/hooks/use-list-state";
import { useProjectContext } from "@/web/providers/project-context-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@deco/ui/components/alert-dialog.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { type TableColumn } from "@deco/ui/components/collection-table.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import {
  DotsVertical,
  Eye,
  Trash01,
  Loading01,
  CpuChip02,
  Folder,
  FolderMinus,
} from "@untitledui/icons";
import { useNavigate } from "@tanstack/react-router";
import { Suspense, useReducer, useState } from "react";
import { toast } from "sonner";

type DialogState =
  | { mode: "idle" }
  | { mode: "deleting"; gateway: GatewayEntity };

type DialogAction =
  | { type: "delete"; gateway: GatewayEntity }
  | { type: "close" };

function dialogReducer(_state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case "delete":
      return { mode: "deleting", gateway: action.gateway };
    case "close":
      return { mode: "idle" };
  }
}

function OrgGatewaysContent() {
  const { org } = useProjectContext();
  const navigate = useNavigate();

  // Folder state
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const { data: folders } = useFolders("gateways");

  // Consolidated list UI state (search, filters, sorting, view mode)
  const listState = useListState<GatewayEntity>({
    namespace: org.slug,
    resource: "gateways",
  });

  const actions = useGatewayActions();
  const allGateways = useGateways(listState);
  const connections = useConnections({});

  // Filter gateways by folder
  const gateways = selectedFolderId
    ? allGateways.filter((g) => g.folder_id === selectedFolderId)
    : allGateways;

  const [dialogState, dispatch] = useReducer(dialogReducer, { mode: "idle" });

  // Helper to move gateway to folder
  const moveToFolder = async (gatewayId: string, folderId: string | null) => {
    await actions.update.mutateAsync({
      id: gatewayId,
      data: { folder_id: folderId },
    });
  };

  const handleCreateGateway = async () => {
    // Check if there are any connections available
    if (connections.length === 0) {
      toast.error("Create at least one MCP connection first");
      return;
    }

    // Auto-create gateway with all connections
    const result = await actions.create.mutateAsync({
      title: "New Gateway",
      description:
        "Gateways let you securely expose integrated tools to the outside world.",
      status: "active",
      tool_selection_strategy: "passthrough",
      tool_selection_mode: "inclusion",
      connections: [],
    });

    // Navigate to the created gateway settings

    navigate({
      to: "/$org/gateways/$gatewayId",
      params: { org: org.slug, gatewayId: result.id },
    });
  };

  const confirmDelete = async () => {
    if (dialogState.mode !== "deleting") return;

    const id = dialogState.gateway.id;
    dispatch({ type: "close" });

    try {
      await actions.delete.mutateAsync(id);
    } catch {
      // Error toast is handled by the mutation's onError
    }
  };

  const columns: TableColumn<GatewayEntity>[] = [
    {
      id: "icon",
      header: "",
      render: (gateway) => (
        <IntegrationIcon
          icon={gateway.icon}
          name={gateway.title}
          size="sm"
          className="shrink-0 shadow-sm"
          fallbackIcon={<CpuChip02 size={16} />}
        />
      ),
      cellClassName: "w-16 shrink-0",
      wrap: true,
    },
    {
      id: "title",
      header: "Name",
      render: (gateway) => (
        <span className="text-sm font-medium text-foreground truncate">
          {gateway.title}
        </span>
      ),
      cellClassName: "w-48 min-w-0 shrink-0",
      sortable: true,
    },
    {
      id: "description",
      header: "Description",
      render: (gateway) => (
        <span className="text-sm text-foreground line-clamp-2">
          {gateway.description || "—"}
        </span>
      ),
      cellClassName: "flex-1 min-w-0",
      wrap: true,
      sortable: true,
    },
    {
      id: "mode",
      header: "Mode",
      accessor: (gateway) => (
        <Badge variant="outline" className="text-xs">
          {gateway.tool_selection_mode === "exclusion" ? "Exclude" : "Include"}
        </Badge>
      ),
      cellClassName: "w-[100px]",
    },
    {
      id: "connections",
      header: "Connections",
      render: (gateway) => (
        <span className="text-sm text-muted-foreground">
          {gateway.connections.length}
        </span>
      ),
      cellClassName: "w-24 shrink-0",
    },
    {
      id: "status",
      header: "Status",
      render: (gateway) => (
        <Badge variant={gateway.status === "active" ? "default" : "outline"}>
          {gateway.status}
        </Badge>
      ),
      cellClassName: "w-24 shrink-0",
      sortable: true,
    },
    {
      id: "actions",
      header: "",
      render: (gateway) => (
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
                  to: "/$org/gateways/$gatewayId",
                  params: { org: org.slug, gatewayId: gateway.id },
                });
              }}
            >
              <Eye size={16} />
              Inspect
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {gateway.folder_id ? (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  moveToFolder(gateway.id, null);
                }}
              >
                <FolderMinus size={16} />
                Remove from folder
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
                <Folder size={16} />
                Move to folder
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {folders.length === 0 ? (
                  <DropdownMenuItem disabled>No folders yet</DropdownMenuItem>
                ) : (
                  folders.map((folder) => (
                    <DropdownMenuItem
                      key={folder.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        moveToFolder(gateway.id, folder.id);
                      }}
                      disabled={gateway.folder_id === folder.id}
                    >
                      <Folder size={14} />
                      {folder.title}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: "delete", gateway });
              }}
            >
              <Trash01 size={16} />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      cellClassName: "w-12 shrink-0",
    },
  ];

  const ctaButton = (
    <Button
      onClick={handleCreateGateway}
      size="sm"
      className="h-7 px-3 rounded-lg text-sm font-medium"
      disabled={actions.create.isPending}
    >
      {actions.create.isPending ? "Creating..." : "Create MCP Gateway"}
    </Button>
  );

  return (
    <CollectionPage>
      {/* Folder Sidebar */}
      <div className="flex h-full">
        <div className="w-56 shrink-0 border-r border-border p-3 overflow-auto">
          <FolderSidebar
            type="gateways"
            items={allGateways}
            selectedFolderId={selectedFolderId}
            onSelectFolder={setSelectedFolderId}
            onItemClick={(gateway) =>
              navigate({
                to: "/$org/gateways/$gatewayId",
                params: { org: org.slug, gatewayId: gateway.id },
              })
            }
            renderItemIcon={(gateway) => (
              <IntegrationIcon
                icon={gateway.icon}
                name={gateway.title}
                size="xs"
                className="shrink-0"
                fallbackIcon={<CpuChip02 />}
              />
            )}
          />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {/* Delete Confirmation Dialog */}
          <AlertDialog
            open={dialogState.mode === "deleting"}
            onOpenChange={(open) => !open && dispatch({ type: "close" })}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Gateway?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete{" "}
                  <span className="font-medium text-foreground">
                    {dialogState.mode === "deleting" &&
                      dialogState.gateway.title}
                  </span>
                  .
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Collection Header */}
          <CollectionHeader
            title="MCP Gateways"
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

          {/* Search Bar */}
          <CollectionSearch
            value={listState.search}
            onChange={listState.setSearch}
            placeholder="Search for a gateway..."
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                listState.setSearch("");
                (event.target as HTMLInputElement).blur();
              }
            }}
          />

          {/* Content: Cards or Table */}
          {listState.viewMode === "cards" ? (
            <div className="flex-1 overflow-auto p-5">
              {gateways.length === 0 ? (
                <EmptyState
                  image={
                    <CpuChip02 size={36} className="text-muted-foreground" />
                  }
                  title={
                    listState.search ? "No gateways found" : "No gateways yet"
                  }
                  description={
                    listState.search
                      ? `No gateways match "${listState.search}"`
                      : "Create a gateway to aggregate tools from multiple MCP connections."
                  }
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {gateways.map((gateway) => (
                    <ConnectionCard
                      key={gateway.id}
                      connection={{
                        id: gateway.id,
                        title: gateway.title,
                        description: gateway.description,
                        icon: gateway.icon,
                        status: gateway.status,
                      }}
                      fallbackIcon={<CpuChip02 />}
                      onClick={() =>
                        navigate({
                          to: "/$org/gateways/$gatewayId",
                          params: { org: org.slug, gatewayId: gateway.id },
                        })
                      }
                      footer={
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            {gateway.connections.length} connection
                            {gateway.connections.length !== 1 ? "s" : ""}
                          </span>
                          <span>•</span>
                          <span>
                            {gateway.tool_selection_mode === "exclusion"
                              ? "Exclude"
                              : "Include"}
                          </span>
                        </div>
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
                                  to: "/$org/gateways/$gatewayId",
                                  params: {
                                    org: org.slug,
                                    gatewayId: gateway.id,
                                  },
                                });
                              }}
                            >
                              <Eye size={16} />
                              Inspect
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {gateway.folder_id ? (
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveToFolder(gateway.id, null);
                                }}
                              >
                                <FolderMinus size={16} />
                                Remove from folder
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Folder size={16} />
                                Move to folder
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                {folders.length === 0 ? (
                                  <DropdownMenuItem disabled>
                                    No folders yet
                                  </DropdownMenuItem>
                                ) : (
                                  folders.map((folder) => (
                                    <DropdownMenuItem
                                      key={folder.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        moveToFolder(gateway.id, folder.id);
                                      }}
                                      disabled={gateway.folder_id === folder.id}
                                    >
                                      <Folder size={14} />
                                      {folder.title}
                                    </DropdownMenuItem>
                                  ))
                                )}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                dispatch({ type: "delete", gateway });
                              }}
                            >
                              <Trash01 size={16} />
                              Delete
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
              data={gateways}
              isLoading={false}
              sortKey={listState.sortKey}
              sortDirection={listState.sortDirection}
              onSort={listState.handleSort}
              onRowClick={(gateway) =>
                navigate({
                  to: "/$org/gateways/$gatewayId",
                  params: { org: org.slug, gatewayId: gateway.id },
                })
              }
              emptyState={
                listState.search ? (
                  <EmptyState
                    image={
                      <CpuChip02 size={36} className="text-muted-foreground" />
                    }
                    title="No gateways found"
                    description={`No gateways match "${listState.search}"`}
                  />
                ) : (
                  <EmptyState
                    image={
                      <CpuChip02 size={36} className="text-muted-foreground" />
                    }
                    title="No gateways yet"
                    description="Create a gateway to aggregate tools from multiple MCP connections."
                  />
                )
              }
            />
          )}
        </div>
      </div>
    </CollectionPage>
  );
}

export default function OrgGateways() {
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
        <OrgGatewaysContent />
      </Suspense>
    </ErrorBoundary>
  );
}

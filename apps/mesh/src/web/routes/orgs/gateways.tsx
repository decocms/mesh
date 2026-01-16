import type { GatewayEntity } from "@/tools/gateway/schema";
import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { CollectionTableWrapper } from "@/web/components/collections/collection-table-wrapper.tsx";
import { ConnectionCard } from "@/web/components/connections/connection-card.tsx";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import {
  useGateways,
  useGatewayActions,
} from "@/web/hooks/collections/use-gateway";
import { useListState } from "@/web/hooks/use-list-state";
import { useCreateGateway } from "@/web/hooks/use-create-gateway";
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
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import {
  DotsVertical,
  Eye,
  Trash01,
  Loading01,
  CpuChip02,
} from "@untitledui/icons";
import { useNavigate } from "@tanstack/react-router";
import { Suspense, useReducer } from "react";

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

  // Consolidated list UI state (search, filters, sorting, view mode)
  const listState = useListState<GatewayEntity>({
    namespace: org.slug,
    resource: "gateways",
  });

  const gateways = useGateways(listState);
  const { createGateway, isCreating } = useCreateGateway({
    navigateOnCreate: true,
  });
  const actions = useGatewayActions();

  const [dialogState, dispatch] = useReducer(dialogReducer, { mode: "idle" });

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
              Open
            </DropdownMenuItem>
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
      onClick={createGateway}
      size="sm"
      className="h-7 px-3 rounded-lg text-sm font-medium"
      disabled={isCreating}
    >
      {isCreating ? "Creating..." : "Create Agent"}
    </Button>
  );

  return (
    <CollectionPage>
      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={dialogState.mode === "deleting"}
        onOpenChange={(open) => !open && dispatch({ type: "close" })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {dialogState.mode === "deleting" && dialogState.gateway.title}
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
        title="Agents"
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
        placeholder="Search for an agent..."
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
              image={<CpuChip02 size={36} className="text-muted-foreground" />}
              title={listState.search ? "No agents found" : "No agents yet"}
              description={
                listState.search
                  ? `No agents match "${listState.search}"`
                  : "Create an agent to aggregate tools from multiple Connections."
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
                          Open
                        </DropdownMenuItem>
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
                title="No agents found"
                description={`No agents match "${listState.search}"`}
              />
            ) : (
              <EmptyState
                image={
                  <CpuChip02 size={36} className="text-muted-foreground" />
                }
                title="No agents yet"
                description="Create an agent to aggregate tools from multiple Connections."
              />
            )
          }
        />
      )}
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

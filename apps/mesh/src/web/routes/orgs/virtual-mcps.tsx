import type { VirtualMCPEntity } from "@/tools/virtual-mcp/schema";
import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { CollectionTableWrapper } from "@/web/components/collections/collection-table-wrapper.tsx";
import { ConnectionCard } from "@/web/components/connections/connection-card.tsx";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import {
  useVirtualMCPs,
  useVirtualMCPActions,
} from "@/web/hooks/collections/use-virtual-mcp";
import { useListState } from "@/web/hooks/use-list-state";
import { useCreateVirtualMCP } from "@/web/hooks/use-create-virtual-mcp";
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
  | { mode: "deleting"; virtualMcp: VirtualMCPEntity };

type DialogAction =
  | { type: "delete"; virtualMcp: VirtualMCPEntity }
  | { type: "close" };

function dialogReducer(_state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case "delete":
      return { mode: "deleting", virtualMcp: action.virtualMcp };
    case "close":
      return { mode: "idle" };
  }
}

function OrgVirtualMCPsContent() {
  const { org } = useProjectContext();
  const navigate = useNavigate();

  // Consolidated list UI state (search, filters, sorting, view mode)
  const listState = useListState<VirtualMCPEntity>({
    namespace: org.slug,
    resource: "virtual-mcps",
  });

  const virtualMcps = useVirtualMCPs(listState);
  const { createVirtualMCP, isCreating } = useCreateVirtualMCP({
    navigateOnCreate: true,
  });
  const actions = useVirtualMCPActions();

  const [dialogState, dispatch] = useReducer(dialogReducer, { mode: "idle" });

  const confirmDelete = async () => {
    if (dialogState.mode !== "deleting") return;

    const id = dialogState.virtualMcp.id;
    dispatch({ type: "close" });

    try {
      await actions.delete.mutateAsync(id);
    } catch {
      // Error toast is handled by the mutation's onError
    }
  };

  const columns: TableColumn<VirtualMCPEntity>[] = [
    {
      id: "icon",
      header: "",
      render: (virtualMcp) => (
        <IntegrationIcon
          icon={virtualMcp.icon}
          name={virtualMcp.title}
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
      render: (virtualMcp) => (
        <span className="text-sm font-medium text-foreground truncate">
          {virtualMcp.title}
        </span>
      ),
      cellClassName: "w-48 min-w-0 shrink-0",
      sortable: true,
    },
    {
      id: "description",
      header: "Description",
      render: (virtualMcp) => (
        <span className="text-sm text-foreground line-clamp-2">
          {virtualMcp.description || "—"}
        </span>
      ),
      cellClassName: "flex-1 min-w-0",
      wrap: true,
      sortable: true,
    },
    {
      id: "mode",
      header: "Mode",
      accessor: (virtualMcp) => (
        <Badge variant="outline" className="text-xs">
          {virtualMcp.tool_selection_mode === "exclusion"
            ? "Exclude"
            : "Include"}
        </Badge>
      ),
      cellClassName: "w-[100px]",
    },
    {
      id: "connections",
      header: "Connections",
      render: (virtualMcp) => (
        <span className="text-sm text-muted-foreground">
          {virtualMcp.connections.length}
        </span>
      ),
      cellClassName: "w-24 shrink-0",
    },
    {
      id: "status",
      header: "Status",
      render: (virtualMcp) => (
        <Badge variant={virtualMcp.status === "active" ? "default" : "outline"}>
          {virtualMcp.status}
        </Badge>
      ),
      cellClassName: "w-24 shrink-0",
      sortable: true,
    },
    {
      id: "actions",
      header: "",
      render: (virtualMcp) => (
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
                  to: "/$org/agents/$virtualMcpId",
                  params: { org: org.slug, virtualMcpId: virtualMcp.id },
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
                dispatch({ type: "delete", virtualMcp });
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
      onClick={createVirtualMCP}
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
                {dialogState.mode === "deleting" &&
                  dialogState.virtualMcp.title}
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
        title={
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Agents</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              — Virtual MCPs
            </span>
          </div>
        }
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
        placeholder="Search agents..."
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
          {virtualMcps.length === 0 ? (
            <EmptyState
              image={<CpuChip02 size={36} className="text-muted-foreground" />}
              title={listState.search ? "No agents found" : "No agents yet"}
              description={
                listState.search
                  ? `No agents match "${listState.search}"`
                  : "Agents are Virtual MCPs that let you select and combine tools, resources, and prompts from your existing connections into a single MCP endpoint."
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {virtualMcps.map((virtualMcp) => (
                <ConnectionCard
                  key={virtualMcp.id}
                  connection={{
                    id: virtualMcp.id,
                    title: virtualMcp.title,
                    description: virtualMcp.description,
                    icon: virtualMcp.icon,
                    status: virtualMcp.status,
                  }}
                  fallbackIcon={<CpuChip02 />}
                  onClick={() =>
                    navigate({
                      to: "/$org/agents/$virtualMcpId",
                      params: { org: org.slug, virtualMcpId: virtualMcp.id },
                    })
                  }
                  footer={
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {virtualMcp.connections.length} connection
                        {virtualMcp.connections.length !== 1 ? "s" : ""}
                      </span>
                      <span>•</span>
                      <span>
                        {virtualMcp.tool_selection_mode === "exclusion"
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
                              to: "/$org/agents/$virtualMcpId",
                              params: {
                                org: org.slug,
                                virtualMcpId: virtualMcp.id,
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
                            dispatch({ type: "delete", virtualMcp });
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
          data={virtualMcps}
          isLoading={false}
          sortKey={listState.sortKey}
          sortDirection={listState.sortDirection}
          onSort={listState.handleSort}
          onRowClick={(virtualMcp) =>
            navigate({
              to: "/$org/agents/$virtualMcpId",
              params: { org: org.slug, virtualMcpId: virtualMcp.id },
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
                description="Agents are Virtual MCPs that let you select and combine tools, resources, and prompts from your existing connections into a single MCP endpoint."
              />
            )
          }
        />
      )}
    </CollectionPage>
  );
}

export default function OrgVirtualMCPs() {
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
        <OrgVirtualMCPsContent />
      </Suspense>
    </ErrorBoundary>
  );
}

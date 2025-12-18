import type { GatewayEntity } from "@/tools/gateway/schema";
import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { CollectionTableWrapper } from "@/web/components/collections/collection-table-wrapper.tsx";
import { ConnectionCard } from "@/web/components/connections/connection-card.tsx";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import {
  useGateways,
  useGatewayActions,
} from "@/web/hooks/collections/use-gateway";
import { useConnections } from "@/web/hooks/collections/use-connection";
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
import { Checkbox } from "@deco/ui/components/checkbox.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deco/ui/components/dialog.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@deco/ui/components/form.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { Input } from "@deco/ui/components/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deco/ui/components/select.tsx";
import { Textarea } from "@deco/ui/components/textarea.tsx";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Suspense, useReducer } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";

// Form validation schema for gateway creation
const gatewayFormSchema = z.object({
  title: z.string().min(1, "Name is required").max(255),
  description: z.string().nullable().optional(),
  status: z.enum(["active", "inactive"]),
  mode: z.enum(["deduplicate", "prefix_all", "custom"]),
  selectedConnectionIds: z
    .array(z.string())
    .min(1, "Select at least one connection"),
});

type GatewayFormData = z.infer<typeof gatewayFormSchema>;

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

function ConnectionSelector({
  selectedIds,
  onSelectionChange,
}: {
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}) {
  const connections = useConnections({});

  const toggleConnection = (connectionId: string) => {
    if (selectedIds.includes(connectionId)) {
      onSelectionChange(selectedIds.filter((id) => id !== connectionId));
    } else {
      onSelectionChange([...selectedIds, connectionId]);
    }
  };

  return (
    <div className="border rounded-lg max-h-48 overflow-auto">
      {connections.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground text-center">
          No connections available. Create an MCP connection first.
        </div>
      ) : (
        <div className="p-2 space-y-1">
          {connections.map((connection) => (
            <label
              key={connection.id}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
            >
              <Checkbox
                checked={selectedIds.includes(connection.id)}
                onCheckedChange={() => toggleConnection(connection.id)}
              />
              <IntegrationIcon
                icon={connection.icon}
                name={connection.title}
                size="sm"
              />
              <span className="text-sm font-medium truncate flex-1">
                {connection.title}
              </span>
              <Badge
                variant={connection.status === "active" ? "default" : "outline"}
                className="text-xs"
              >
                {connection.status}
              </Badge>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function OrgGatewaysContent() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { action?: "create" };

  // Consolidated list UI state (search, filters, sorting, view mode)
  const listState = useListState<GatewayEntity>({
    namespace: org.slug,
    resource: "gateways",
  });

  const actions = useGatewayActions();
  const gateways = useGateways(listState);

  const [dialogState, dispatch] = useReducer(dialogReducer, { mode: "idle" });

  // Create dialog state is derived from search params
  const isCreating = search.action === "create";

  const openCreateDialog = () => {
    navigate({
      to: "/$org/gateways",
      params: { org: org.slug },
      search: { action: "create" },
    });
  };

  const closeCreateDialog = () => {
    navigate({ to: "/$org/gateways", params: { org: org.slug }, search: {} });
  };

  // React Hook Form setup
  const form = useForm<GatewayFormData>({
    resolver: zodResolver(gatewayFormSchema),
    defaultValues: {
      title: "",
      description: null,
      status: "active",
      mode: "deduplicate",
      selectedConnectionIds: [],
    },
  });

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

  const onSubmit = async (data: GatewayFormData) => {
    // Create new gateway
    const result = await actions.create.mutateAsync({
      title: data.title,
      description: data.description || null,
      status: data.status,
      mode: { type: data.mode },
      connections: data.selectedConnectionIds.map((connectionId) => ({
        connection_id: connectionId,
        selected_tools: null, // Default to all tools
      })),
    });

    closeCreateDialog();
    form.reset();

    // Navigate to the created gateway detail
    if (result?.id) {
      navigate({
        to: "/$org/gateways/$gatewayId",
        params: { org: org.slug, gatewayId: result.id },
      });
    }
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      closeCreateDialog();
      form.reset();
    }
  };

  const columns: TableColumn<GatewayEntity>[] = [
    {
      id: "title",
      header: "Name",
      render: (gateway) => (
        <span className="text-sm font-medium text-foreground">
          {gateway.title}
        </span>
      ),
      sortable: true,
    },
    {
      id: "description",
      header: "Description",
      render: (gateway) => (
        <span className="text-sm text-foreground line-clamp-2 max-w-sm wrap-break-word whitespace-normal">
          {gateway.description || "—"}
        </span>
      ),
      cellClassName: "flex-1",
      sortable: true,
    },
    {
      id: "mode",
      header: "Mode",
      accessor: (gateway) => (
        <Badge variant="outline" className="text-xs">
          {gateway.mode.type}
        </Badge>
      ),
      cellClassName: "w-[120px]",
    },
    {
      id: "connections",
      header: "Connections",
      render: (gateway) => (
        <span className="text-sm text-muted-foreground">
          {gateway.connections.length}
        </span>
      ),
      cellClassName: "w-[100px]",
    },
    {
      id: "status",
      header: "Status",
      render: (gateway) => (
        <Badge variant={gateway.status === "active" ? "default" : "outline"}>
          {gateway.status}
        </Badge>
      ),
      cellClassName: "w-[120px]",
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
              <Icon name="more_vert" size={20} />
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
              <Icon name="visibility" size={16} />
              Inspect
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: "delete", gateway });
              }}
            >
              <Icon name="delete" size={16} />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      cellClassName: "w-[60px]",
    },
  ];

  const ctaButton = (
    <Button
      onClick={openCreateDialog}
      size="sm"
      className="h-7 px-3 rounded-lg text-sm font-medium"
    >
      Create Gateway
    </Button>
  );

  return (
    <CollectionPage>
      {/* Create Gateway Dialog */}
      <Dialog open={isCreating} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Create New Gateway</DialogTitle>
            <DialogDescription>
              Create a gateway to aggregate tools from multiple MCP connections.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid gap-4 py-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="My Gateway" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="A brief description of this gateway"
                          rows={2}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="mode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mode</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="deduplicate">
                              Deduplicate
                            </SelectItem>
                            <SelectItem value="prefix_all">
                              Prefix All
                            </SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="selectedConnectionIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Connections *</FormLabel>
                      <FormControl>
                        <ErrorBoundary>
                          <Suspense
                            fallback={
                              <div className="border rounded-lg p-4 flex items-center justify-center">
                                <Icon
                                  name="progress_activity"
                                  size={20}
                                  className="animate-spin text-muted-foreground"
                                />
                              </div>
                            }
                          >
                            <ConnectionSelector
                              selectedIds={field.value}
                              onSelectionChange={field.onChange}
                            />
                          </Suspense>
                        </ErrorBoundary>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleDialogClose(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="min-w-40"
                >
                  {form.formState.isSubmitting
                    ? "Creating..."
                    : "Create Gateway"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

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
                <Icon name="hub" size={48} className="text-muted-foreground" />
              }
              title={listState.search ? "No gateways found" : "No gateways yet"}
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
                    icon: "hub",
                    status: gateway.status,
                  }}
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
                      <span>{gateway.mode.type}</span>
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
                          <Icon name="more_vert" size={20} />
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
                          <Icon name="visibility" size={16} />
                          Inspect
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            dispatch({ type: "delete", gateway });
                          }}
                        >
                          <Icon name="delete" size={16} />
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
                  <Icon
                    name="hub"
                    size={48}
                    className="text-muted-foreground"
                  />
                }
                title="No gateways found"
                description={`No gateways match "${listState.search}"`}
              />
            ) : (
              <EmptyState
                image={
                  <Icon
                    name="hub"
                    size={48}
                    className="text-muted-foreground"
                  />
                }
                title="No gateways yet"
                description="Create a gateway to aggregate tools from multiple MCP connections."
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
            <Icon
              name="progress_activity"
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

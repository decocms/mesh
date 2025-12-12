import type { ConnectionEntity } from "@/tools/connection/schema";
import { ConnectionEntitySchema } from "@/tools/connection/schema";
import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { CollectionTableWrapper } from "@/web/components/collections/collection-table-wrapper.tsx";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import {
  useConnections,
  useConnectionsCollection,
} from "@/web/hooks/collections/use-connection";
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
import { Card } from "@deco/ui/components/card.tsx";
import { type TableColumn } from "@deco/ui/components/collection-table.tsx";
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
import { Loader2 } from "lucide-react";
import { Suspense, useEffect, useReducer } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { authClient } from "@/web/lib/auth-client";
import { generateConnectionId } from "@/shared/utils/generate-id";

// Form validation schema derived from ConnectionEntitySchema
// Pick the relevant fields and adapt for form use
const connectionFormSchema = ConnectionEntitySchema.pick({
  title: true,
  description: true,
  connection_type: true,
  connection_url: true,
  connection_token: true,
}).partial({
  // These are optional for form input
  description: true,
  connection_token: true,
});

type ConnectionFormData = z.infer<typeof connectionFormSchema>;

type DialogState =
  | { mode: "idle" }
  | { mode: "editing"; connection: ConnectionEntity }
  | { mode: "deleting"; connection: ConnectionEntity };

type DialogAction =
  | { type: "edit"; connection: ConnectionEntity }
  | { type: "delete"; connection: ConnectionEntity }
  | { type: "close" };

function dialogReducer(_state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case "edit":
      return { mode: "editing", connection: action.connection };
    case "delete":
      return { mode: "deleting", connection: action.connection };
    case "close":
      return { mode: "idle" };
  }
}

function OrgMcpsContent() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { action?: "create" };
  const { data: session } = authClient.useSession();

  // Consolidated list UI state (search, filters, sorting, view mode)
  const listState = useListState<ConnectionEntity>({
    namespace: org.slug,
    resource: "connections",
  });

  const connectionsCollection = useConnectionsCollection();
  const connections = useConnections(listState);

  const [dialogState, dispatch] = useReducer(dialogReducer, { mode: "idle" });

  // Create dialog state is derived from search params
  const isCreating = search.action === "create";

  const openCreateDialog = () => {
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
      search: { action: "create" },
    });
  };

  const closeCreateDialog = () => {
    navigate({ to: "/$org/mcps", params: { org: org.slug }, search: {} });
  };

  // React Hook Form setup
  const form = useForm<ConnectionFormData>({
    resolver: zodResolver(connectionFormSchema),
    defaultValues: {
      title: "",
      description: null,
      connection_type: "HTTP",
      connection_url: "",
      connection_token: null,
    },
  });

  // Reset form when editing connection changes
  const editingConnection =
    dialogState.mode === "editing" ? dialogState.connection : null;

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (editingConnection) {
      form.reset({
        title: editingConnection.title,
        description: editingConnection.description,
        connection_type: editingConnection.connection_type,
        connection_url: editingConnection.connection_url,
        connection_token: null, // Don't pre-fill token for security
      });
    } else {
      form.reset({
        title: "",
        description: null,
        connection_type: "HTTP",
        connection_url: "",
        connection_token: null,
      });
    }
  }, [editingConnection, form]);

  const confirmDelete = async () => {
    if (dialogState.mode !== "deleting") return;

    const id = dialogState.connection.id;
    dispatch({ type: "close" });

    try {
      await connectionsCollection.delete(id).isPersisted.promise;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete connection",
      );
    }
  };

  const onSubmit = async (data: ConnectionFormData) => {
    try {
      // Close dialog based on mode
      if (isCreating) {
        closeCreateDialog();
      } else {
        dispatch({ type: "close" });
      }
      form.reset();

      if (editingConnection) {
        // Update existing connection
        const tx = connectionsCollection.update(
          editingConnection.id,
          (draft) => {
            draft.title = data.title;
            draft.description = data.description || null;
            draft.connection_type = data.connection_type;
            draft.connection_url = data.connection_url;
            if (data.connection_token) {
              draft.connection_token = data.connection_token;
            }
          },
        );
        await tx.isPersisted.promise;
      } else {
        // Create new connection
        const tx = connectionsCollection.insert({
          id: generateConnectionId(),
          title: data.title,
          description: data.description || null,
          connection_type: data.connection_type,
          connection_url: data.connection_url,
          connection_token: data.connection_token || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: session?.user?.id || "system",
          organization_id: org.id,
          icon: null,
          app_name: null,
          app_id: null,
          connection_headers: null,
          oauth_config: null,
          configuration_state: null,
          metadata: null,
          tools: null,
          bindings: null,
          status: "inactive",
        });
        await tx.isPersisted.promise;

        if (tx.mutations[0]?.key && org) {
          navigate({
            to: "/$org/mcps/$connectionId",
            params: { org: org.slug, connectionId: tx.mutations[0].key },
          });
        }
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save connection",
      );
    }
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      if (isCreating) {
        closeCreateDialog();
      } else {
        dispatch({ type: "close" });
      }
      form.reset();
    }
  };

  const columns: TableColumn<ConnectionEntity>[] = [
    {
      id: "icon",
      header: "",
      render: (connection) => (
        <div className="flex items-center justify-center">
          <IntegrationIcon
            icon={connection.icon}
            name={connection.title}
            size="sm"
            className="shrink-0 shadow-sm"
          />
        </div>
      ),
      cellClassName: "w-[72px]",
    },
    {
      id: "title",
      header: "Name",
      render: (connection) => (
        <span className="text-sm font-medium text-foreground">
          {connection.title}
        </span>
      ),
      sortable: true,
    },
    {
      id: "description",
      header: "Description",
      render: (connection) => (
        <span className="text-sm text-foreground line-clamp-2 max-w-sm break-words whitespace-normal">
          {connection.description || "—"}
        </span>
      ),
      cellClassName: "flex-1",
      sortable: true,
    },
    {
      id: "connection_type",
      header: "Type",
      accessor: (connection) => (
        <span className="text-sm font-medium">
          {connection.connection_type}
        </span>
      ),
      cellClassName: "w-[120px]",
      sortable: true,
    },
    {
      id: "connection_url",
      header: "URL",
      render: (connection) => (
        <span className="text-sm text-muted-foreground block truncate max-w-sm">
          {connection.connection_url}
        </span>
      ),
      wrap: true,
      cellClassName: "max-w-sm",
    },
    {
      id: "status",
      header: "Status",
      render: (connection) => (
        <Badge variant={connection.status === "active" ? "default" : "outline"}>
          {connection.status}
        </Badge>
      ),
      cellClassName: "w-[120px]",
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
              <Icon name="more_vert" size={20} />
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
              <Icon name="visibility" size={16} />
              Inspect
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: "delete", connection });
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
      Add MCP
    </Button>
  );

  return (
    <CollectionPage>
      <Dialog
        open={isCreating || dialogState.mode === "editing"}
        onOpenChange={handleDialogClose}
      >
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>
              {editingConnection ? "Edit Connection" : "Create New Connection"}
            </DialogTitle>
            <DialogDescription>
              {editingConnection
                ? "Update the connection details below."
                : "Add a new connection to your organization. Fill in the details below."}
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
                        <Input placeholder="My Connection" {...field} />
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
                          placeholder="A brief description of this connection"
                          rows={3}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="connection_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type *</FormLabel>
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
                          <SelectItem value="HTTP">HTTP</SelectItem>
                          <SelectItem value="SSE">SSE</SelectItem>
                          <SelectItem value="Websocket">Websocket</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="connection_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://example.com/mcp"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="connection_token"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Token (optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Bearer token or API key"
                          {...field}
                          value={field.value ?? ""}
                        />
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
                <Button type="submit">
                  {editingConnection
                    ? "Update Connection"
                    : "Create Connection"}
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
            <AlertDialogTitle>Delete Connection?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {dialogState.mode === "deleting" &&
                  dialogState.connection.title}
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
        title="MCPs"
        viewMode={listState.viewMode}
        onViewModeChange={listState.setViewMode}
        sortKey={listState.sortKey}
        sortDirection={listState.sortDirection}
        onSort={listState.handleSort}
        sortOptions={[
          { id: "title", label: "Name" },
          { id: "description", label: "Description" },
          { id: "connection_type", label: "Type" },
          { id: "status", label: "Status" },
        ]}
        ctaButton={ctaButton}
      />

      {/* Search Bar */}
      <CollectionSearch
        value={listState.search}
        onChange={listState.setSearch}
        placeholder="Search for a MCP..."
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
          {connections.length === 0 ? (
            <EmptyState
              image={
                <img
                  src="/emptystate-mcp.svg"
                  alt=""
                  width={500}
                  height={223}
                  aria-hidden="true"
                />
              }
              title={listState.search ? "No MCPs found" : "No MCPs found"}
              description={
                listState.search
                  ? `No MCPs match "${listState.search}"`
                  : "Create a connection to get started."
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {connections.map((connection) => (
                <Card
                  key={connection.id}
                  className="cursor-pointer transition-colors group"
                  onClick={() =>
                    navigate({
                      to: "/$org/mcps/$connectionId",
                      params: { org: org.slug, connectionId: connection.id },
                    })
                  }
                >
                  <div className="flex flex-col gap-4 p-6 relative">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 absolute top-5 right-5 opacity-0 group-hover:opacity-100 transition-opacity"
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
                              to: "/$org/mcps/$connectionId",
                              params: {
                                org: org.slug,
                                connectionId: connection.id,
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
                            dispatch({ type: "delete", connection });
                          }}
                        >
                          <Icon name="delete" size={16} />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <IntegrationIcon
                      icon={connection.icon}
                      name={connection.title}
                      size="md"
                      className="shrink-0 shadow-sm"
                    />
                    <div className="flex flex-col gap-0">
                      <h3 className="text-base font-medium text-foreground truncate">
                        {connection.title}
                      </h3>
                      <p className="text-base text-muted-foreground line-clamp-2">
                        {connection.description || "No description"}
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
          data={connections}
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
                    width={500}
                    height={223}
                    aria-hidden="true"
                  />
                }
                title="No MCPs found"
                description={`No MCPs match "${listState.search}"`}
              />
            ) : (
              <EmptyState
                image={
                  <img
                    src="/emptystate-mcp.svg"
                    alt=""
                    width={500}
                    height={223}
                    aria-hidden="true"
                  />
                }
                title="No MCPs found"
                description="Create a connection to get started."
              />
            )
          }
        />
      )}
    </CollectionPage>
  );
}

export default function OrgMcps() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <OrgMcpsContent />
      </Suspense>
    </ErrorBoundary>
  );
}

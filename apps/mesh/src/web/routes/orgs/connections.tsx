import type { ConnectionEntity } from "@/tools/connection/schema";
import { CollectionHeader } from "@/web/components/collections/collection-header.tsx";
import { CollectionPage } from "@/web/components/collections/collection-page.tsx";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { CollectionTableWrapper } from "@/web/components/collections/collection-table-wrapper.tsx";
import { ConnectionCard } from "@/web/components/connections/connection-card.tsx";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import {
  useConnections,
  useConnectionActions,
} from "@/web/hooks/collections/use-connection";
import { useListState } from "@/web/hooks/use-list-state";
import { useAuthConfig } from "@/web/providers/auth-config-provider";
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
import {
  DotsVertical,
  Eye,
  Trash01,
  Loading01,
  Container,
  Terminal,
  Globe02,
} from "@untitledui/icons";
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
import { Suspense, useEffect, useReducer } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { authClient } from "@/web/lib/auth-client";
import { generatePrefixedId } from "@/shared/utils/generate-id";

import type {
  StdioConnectionParameters,
  HttpConnectionParameters,
} from "@/tools/connection/schema";
import { isStdioParameters } from "@/tools/connection/schema";
import {
  EnvVarsEditor,
  envVarsToRecord,
  recordToEnvVars,
  type EnvVar,
} from "@/web/components/env-vars-editor";

// Environment variable schema
const envVarSchema = z.object({
  key: z.string(),
  value: z.string(),
});

// Form validation schema derived from ConnectionEntitySchema
// Pick the relevant fields and adapt for form use
const connectionFormSchema = z
  .object({
    title: z.string().min(1, "Name is required"),
    description: z.string().nullable().optional(),
    // UI type - includes "NPX" and "STDIO" which both map to STDIO internally
    ui_type: z.enum(["HTTP", "SSE", "Websocket", "NPX", "STDIO"]),
    // For HTTP/SSE/Websocket
    connection_url: z.string().optional(),
    connection_token: z.string().nullable().optional(),
    // For NPX
    npx_package: z.string().optional(),
    // For STDIO (custom command)
    stdio_command: z.string().optional(),
    stdio_args: z.string().optional(),
    stdio_cwd: z.string().optional(),
    // Shared: Environment variables for both NPX and STDIO
    env_vars: z.array(envVarSchema).optional(),
  })
  .refine(
    (data) => {
      if (data.ui_type === "NPX") {
        return !!data.npx_package?.trim();
      }
      return true;
    },
    { message: "NPM package is required", path: ["npx_package"] },
  )
  .refine(
    (data) => {
      if (data.ui_type === "STDIO") {
        return !!data.stdio_command?.trim();
      }
      return true;
    },
    { message: "Command is required", path: ["stdio_command"] },
  )
  .refine(
    (data) => {
      if (
        data.ui_type === "HTTP" ||
        data.ui_type === "SSE" ||
        data.ui_type === "Websocket"
      ) {
        return !!data.connection_url?.trim();
      }
      return true;
    },
    { message: "URL is required", path: ["connection_url"] },
  );

type ConnectionFormData = z.infer<typeof connectionFormSchema>;

/**
 * Build STDIO connection_headers from NPX form fields
 */
function buildNpxParameters(
  packageName: string,
  envVars: EnvVar[],
): StdioConnectionParameters {
  const params: StdioConnectionParameters = {
    command: "npx",
    args: ["-y", packageName],
  };
  const envRecord = envVarsToRecord(envVars);
  if (Object.keys(envRecord).length > 0) {
    params.envVars = envRecord;
  }
  return params;
}

/**
 * Build STDIO connection_headers from custom command form fields
 */
function buildCustomStdioParameters(
  command: string,
  argsString: string,
  cwd: string | undefined,
  envVars: EnvVar[],
): StdioConnectionParameters {
  const params: StdioConnectionParameters = {
    command: command,
  };

  if (argsString.trim()) {
    params.args = argsString.trim().split(/\s+/);
  }

  if (cwd?.trim()) {
    params.cwd = cwd.trim();
  }

  const envRecord = envVarsToRecord(envVars);
  if (Object.keys(envRecord).length > 0) {
    params.envVars = envRecord;
  }

  return params;
}

/**
 * Check if STDIO params look like an NPX command
 */
function isNpxCommand(params: StdioConnectionParameters): boolean {
  return params.command === "npx";
}

/**
 * Parse STDIO connection_headers back to NPX form fields
 */
function parseStdioToNpx(params: StdioConnectionParameters): string {
  return params.args?.find((a) => !a.startsWith("-")) ?? "";
}

/**
 * Parse STDIO connection_headers to custom command form fields
 */
function parseStdioToCustom(params: StdioConnectionParameters): {
  command: string;
  args: string;
  cwd: string;
} {
  return {
    command: params.command,
    args: params.args?.join(" ") ?? "",
    cwd: params.cwd ?? "",
  };
}

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
  const { stdioEnabled } = useAuthConfig();

  // Consolidated list UI state (search, filters, sorting, view mode)
  const listState = useListState<ConnectionEntity>({
    namespace: org.slug,
    resource: "connections",
  });

  const actions = useConnectionActions();
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
      ui_type: "HTTP",
      connection_url: "",
      connection_token: null,
      npx_package: "",
      stdio_command: "",
      stdio_args: "",
      stdio_cwd: "",
      env_vars: [],
    },
  });

  // Watch the ui_type to conditionally render fields
  const uiType = form.watch("ui_type");

  // Reset form when editing connection changes
  const editingConnection =
    dialogState.mode === "editing" ? dialogState.connection : null;

  // oxlint-disable-next-line ban-use-effect/ban-use-effect
  useEffect(() => {
    if (editingConnection) {
      // Check if it's an STDIO connection
      const stdioParams = isStdioParameters(
        editingConnection.connection_headers,
      )
        ? editingConnection.connection_headers
        : null;

      if (stdioParams && editingConnection.connection_type === "STDIO") {
        const envVars = recordToEnvVars(stdioParams.envVars);

        if (isNpxCommand(stdioParams)) {
          // NPX connection
          const npxPackage = parseStdioToNpx(stdioParams);
          form.reset({
            title: editingConnection.title,
            description: editingConnection.description,
            ui_type: "NPX",
            connection_url: "",
            connection_token: null,
            npx_package: npxPackage,
            stdio_command: "",
            stdio_args: "",
            stdio_cwd: "",
            env_vars: envVars,
          });
        } else {
          // Custom STDIO connection
          const customData = parseStdioToCustom(stdioParams);
          form.reset({
            title: editingConnection.title,
            description: editingConnection.description,
            ui_type: "STDIO",
            connection_url: "",
            connection_token: null,
            npx_package: "",
            stdio_command: customData.command,
            stdio_args: customData.args,
            stdio_cwd: customData.cwd,
            env_vars: envVars,
          });
        }
      } else {
        // HTTP/SSE/Websocket connection
        form.reset({
          title: editingConnection.title,
          description: editingConnection.description,
          ui_type: editingConnection.connection_type as
            | "HTTP"
            | "SSE"
            | "Websocket",
          connection_url: editingConnection.connection_url ?? "",
          connection_token: null,
          npx_package: "",
          stdio_command: "",
          stdio_args: "",
          stdio_cwd: "",
          env_vars: [],
        });
      }
    } else {
      form.reset({
        title: "",
        description: null,
        ui_type: "HTTP",
        connection_url: "",
        connection_token: null,
        npx_package: "",
        stdio_command: "",
        stdio_args: "",
        stdio_cwd: "",
        env_vars: [],
      });
    }
  }, [editingConnection, form]);

  const confirmDelete = async () => {
    if (dialogState.mode !== "deleting") return;

    const id = dialogState.connection.id;
    dispatch({ type: "close" });

    try {
      await actions.delete.mutateAsync(id);
    } catch {
      // Error toast is handled by the mutation's onError
    }
  };

  const onSubmit = async (data: ConnectionFormData) => {
    // Determine actual connection_type, connection_url, and connection_headers based on ui_type
    let connectionType: "HTTP" | "SSE" | "Websocket" | "STDIO";
    let connectionUrl: string | null = null;
    let connectionToken: string | null = null;
    let connectionParameters:
      | StdioConnectionParameters
      | HttpConnectionParameters
      | null = null;

    if (data.ui_type === "NPX") {
      // NPX maps to STDIO with parameters (no URL needed)
      connectionType = "STDIO";
      connectionUrl = "";
      connectionParameters = buildNpxParameters(
        data.npx_package || "",
        data.env_vars || [],
      );
    } else if (data.ui_type === "STDIO") {
      // Custom STDIO command
      connectionType = "STDIO";
      connectionUrl = "";
      connectionParameters = buildCustomStdioParameters(
        data.stdio_command || "",
        data.stdio_args || "",
        data.stdio_cwd,
        data.env_vars || [],
      );
    } else {
      connectionType = data.ui_type;
      connectionUrl = data.connection_url || "";
      connectionToken = data.connection_token || null;
    }

    if (editingConnection) {
      // Update existing connection
      await actions.update.mutateAsync({
        id: editingConnection.id,
        data: {
          title: data.title,
          description: data.description || null,
          connection_type: connectionType,
          connection_url: connectionUrl,
          ...(connectionToken && { connection_token: connectionToken }),
          ...(connectionParameters && {
            connection_headers: connectionParameters,
          }),
        },
      });

      dispatch({ type: "close" });
      form.reset();
      return;
    }

    const newId = generatePrefixedId("conn");
    // Create new connection
    await actions.create.mutateAsync({
      id: newId,
      title: data.title,
      description: data.description || null,
      connection_type: connectionType,
      connection_url: connectionUrl,
      connection_token: connectionToken,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: session?.user?.id || "system",
      organization_id: org.id,
      icon: null,
      app_name: null,
      app_id: null,
      connection_headers: connectionParameters,
      oauth_config: null,
      configuration_state: null,
      metadata: null,
      tools: null,
      bindings: null,
      status: "inactive",
    });

    closeCreateDialog();
    form.reset();
    navigate({
      to: "/$org/mcps/$connectionId",
      params: { org: org.slug, connectionId: newId },
    });
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
        <span
          className="text-sm font-medium text-foreground truncate block"
          title={connection.title}
        >
          {connection.title}
        </span>
      ),
      cellClassName: "w-48 max-w-48 min-w-0 shrink-0",
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
      id: "connection_type",
      header: "Type",
      accessor: (connection) => (
        <span className="text-sm font-medium">
          {connection.connection_type}
        </span>
      ),
      cellClassName: "w-24 shrink-0",
      sortable: true,
    },
    {
      id: "connection_url",
      header: "URL",
      render: (connection) => {
        const url = connection.connection_url ?? "";
        const truncated = url.length > 40 ? `${url.slice(0, 40)}...` : url;
        return (
          <span className="text-sm text-muted-foreground">{truncated}</span>
        );
      },
      cellClassName: "w-48 min-w-0 shrink-0",
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
                dispatch({ type: "delete", connection });
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
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        onClick={() =>
          navigate({ to: "/$org/store", params: { org: org.slug } })
        }
        size="sm"
        className="h-7 px-3 rounded-lg text-sm font-medium"
      >
        Browse Store
      </Button>
      <Button
        onClick={openCreateDialog}
        size="sm"
        className="h-7 px-3 rounded-lg text-sm font-medium"
      >
        Custom Connection
      </Button>
    </div>
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
              {editingConnection ? "Edit Connection" : "Create Connection"}
            </DialogTitle>
            <DialogDescription>
              {editingConnection
                ? "Update the connection details below."
                : "Create a custom connection in your organization. Fill in the details below."}
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
                  name="ui_type"
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
                          <SelectItem value="HTTP">
                            <span className="flex items-center gap-2">
                              <Globe02 className="w-4 h-4" />
                              HTTP
                            </span>
                          </SelectItem>
                          <SelectItem value="SSE">
                            <span className="flex items-center gap-2">
                              <Globe02 className="w-4 h-4" />
                              SSE
                            </span>
                          </SelectItem>
                          <SelectItem value="Websocket">
                            <span className="flex items-center gap-2">
                              <Globe02 className="w-4 h-4" />
                              Websocket
                            </span>
                          </SelectItem>
                          {stdioEnabled && (
                            <>
                              <SelectItem value="NPX">
                                <span className="flex items-center gap-2">
                                  <Container className="w-4 h-4" />
                                  NPX Package
                                </span>
                              </SelectItem>
                              <SelectItem value="STDIO">
                                <span className="flex items-center gap-2">
                                  <Terminal className="w-4 h-4" />
                                  Custom Command
                                </span>
                              </SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* NPX-specific fields */}
                {uiType === "NPX" && (
                  <>
                    <FormField
                      control={form.control}
                      name="npx_package"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>NPM Package *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="@perplexity-ai/mcp-server"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            The npm package to run with npx
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {/* STDIO/Custom Command fields */}
                {uiType === "STDIO" && (
                  <>
                    <div className="grid grid-cols-2 gap-4 items-start">
                      <FormField
                        control={form.control}
                        name="stdio_command"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Command *</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="node, bun, python..."
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
                        name="stdio_args"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Arguments</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="arg1 arg2 --flag value"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="stdio_cwd"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Working Directory</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="/path/to/project (optional)"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            Directory where the command will be executed
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {/* Shared: Environment Variables for NPX and STDIO */}
                {(uiType === "NPX" || uiType === "STDIO") && (
                  <FormField
                    control={form.control}
                    name="env_vars"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Environment Variables</FormLabel>
                        <FormControl>
                          <EnvVarsEditor
                            value={field.value ?? []}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* HTTP/SSE/Websocket fields */}
                {uiType !== "NPX" && uiType !== "STDIO" && (
                  <>
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
                              value={field.value ?? ""}
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
                  </>
                )}
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
                    ? "Saving..."
                    : editingConnection
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
        title="Connections"
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
        placeholder="Search for a Connection..."
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
                  width={336}
                  height={320}
                  aria-hidden="true"
                />
              }
              title={
                listState.search
                  ? "No Connections found"
                  : "No Connections found"
              }
              description={
                listState.search
                  ? `No Connections match "${listState.search}"`
                  : "Create a connection to get started."
              }
              actions={
                !listState.search && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      navigate({
                        to: "/$org/store",
                        params: { org: org.slug },
                      })
                    }
                  >
                    Browse Store
                  </Button>
                )
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {connections.map((connection) => (
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
                            dispatch({ type: "delete", connection });
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
                    width={400}
                    height={178}
                    aria-hidden="true"
                  />
                }
                title="No Connections found"
                description={`No Connections match "${listState.search}"`}
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
                title="No Connections found"
                description="Create a connection to get started."
                actions={
                  <Button
                    variant="outline"
                    onClick={() =>
                      navigate({
                        to: "/$org/store",
                        params: { org: org.slug },
                      })
                    }
                  >
                    Browse Store
                  </Button>
                }
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
            <Loading01
              size={32}
              className="animate-spin text-muted-foreground"
            />
          </div>
        }
      >
        <OrgMcpsContent />
      </Suspense>
    </ErrorBoundary>
  );
}

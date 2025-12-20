import { createToolCaller } from "@/tools/client";
import type { ConnectionEntity } from "@/tools/connection/schema";
import { ConnectionEntitySchema } from "@/tools/connection/schema";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary.tsx";
import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import {
  useConnectionActions,
  useConnections,
} from "@/web/hooks/collections/use-connection";
import { useBindingConnections } from "@/web/hooks/use-binding";
import { useBindingSchemaFromRegistry } from "@/web/hooks/use-binding-schema-from-registry";
import { useInstallFromRegistry } from "@/web/hooks/use-install-from-registry";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { authenticateMcp } from "@/web/lib/browser-oauth-provider";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Button } from "@deco/ui/components/button.tsx";
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
import { zodResolver } from "@hookform/resolvers/zod";
import RjsfForm from "@rjsf/shadcn";
import type { FieldTemplateProps, ObjectFieldTemplateProps } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ViewActions } from "../layout";

const connectionFormSchema = ConnectionEntitySchema.pick({
  title: true,
  description: true,
  connection_type: true,
  connection_url: true,
  connection_token: true,
  configuration_scopes: true,
  configuration_state: true,
}).partial({
  description: true,
  connection_token: true,
});

type ConnectionFormData = z.infer<typeof connectionFormSchema>;

interface SettingsTabProps {
  connection: ConnectionEntity;
  onUpdate: (connection: Partial<ConnectionEntity>) => Promise<void>;
  isUpdating: boolean;
  isMCPAuthenticated: boolean;
}

type SettingsTabWithMcpBindingProps = SettingsTabProps & {
  hasMcpBinding: true;
};

type SettingsTabWithoutMcpBindingProps = SettingsTabProps & {
  hasMcpBinding: false;
};

type SettingsTabContentImplProps =
  | (SettingsTabWithMcpBindingProps & {
      stateSchema: Record<string, unknown>;
      scopes: string[];
    })
  | (SettingsTabWithoutMcpBindingProps & {
      stateSchema?: never;
      scopes?: never;
    });

interface McpConfigurationResult {
  stateSchema: Record<string, unknown>;
  scopes?: string[];
}

function useMcpConfiguration(connectionId: string) {
  const toolCaller = createToolCaller(connectionId);

  const { data: configResult } = useToolCall<
    Record<string, never>,
    McpConfigurationResult
  >({
    toolCaller,
    toolName: "MCP_CONFIGURATION",
    toolInputParams: {},
    scope: connectionId,
  });

  const stateSchema = configResult.stateSchema ?? {
    type: "object",
    properties: {},
  };

  const scopes = configResult.scopes ?? [];

  return { stateSchema, scopes };
}

interface McpConfigurationFormProps {
  formState: Record<string, unknown>;
  onFormStateChange: (state: Record<string, unknown>) => void;
  stateSchema: Record<string, unknown>;
}

interface FormContext {
  onFieldChange: (fieldPath: string, value: unknown) => void;
  formData: Record<string, unknown>;
  onAddNew: () => void;
}

/**
 * Check if a schema property represents a binding field
 */
function isBindingField(schema: Record<string, unknown>): boolean {
  const properties = schema.properties as Record<string, unknown> | undefined;
  if (!properties) return false;

  const typeProperty = properties.__type as Record<string, unknown> | undefined;
  const bindingProperty = properties.__binding as
    | Record<string, unknown>
    | undefined;

  return !!(typeProperty?.const || bindingProperty?.const);
}

/**
 * Extract binding info from schema
 */
function getBindingInfo(schema: Record<string, unknown>): {
  bindingType?: string;
  bindingSchema?: unknown;
} {
  const properties = schema.properties as Record<string, unknown> | undefined;
  if (!properties) return {};

  const typeProperty = properties.__type as Record<string, unknown> | undefined;
  const bindingProperty = properties.__binding as
    | Record<string, unknown>
    | undefined;

  return {
    bindingType: typeProperty?.const as string | undefined,
    bindingSchema: bindingProperty?.const,
  };
}

/**
 * Extract field name from child element id
 * e.g., "root_llm___type" -> "llm", "root_model_value" -> "model"
 */
function extractFieldName(childId: string): string {
  // Remove "root_" prefix and get the first segment
  const withoutRoot = childId.replace(/^root_/, "");
  // Split by underscore and get the first part (the field name)
  const parts = withoutRoot.split("_");
  return parts[0] || "";
}

/**
 * Check if a binding schema value represents an app name that needs dynamic resolution
 * @example "@deco/database" -> true, "deco/database" -> true, [{name: "TOOL"}] -> false
 */
function isDynamicBindingSchema(
  bindingSchema: unknown,
): bindingSchema is string {
  if (typeof bindingSchema !== "string") return false;
  // Check for @scope/app or scope/app format
  const normalized = bindingSchema.startsWith("@")
    ? bindingSchema.slice(1)
    : bindingSchema;
  return normalized.includes("/");
}

/**
 * Props for BindingFieldWithDynamicSchema component
 */
interface BindingFieldWithDynamicSchemaProps {
  bindingSchema: unknown;
  bindingType?: string;
  currentValue: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  onAddNew: () => void;
  className?: string;
}

/**
 * Wrapper component that handles dynamic binding schema resolution from registry.
 * If bindingSchema is an app name (e.g., "@deco/database"), it fetches the
 * binding tools from the registry and uses them for filtering.
 */
function BindingFieldWithDynamicSchema({
  bindingSchema,
  bindingType,
  currentValue,
  onValueChange,
  placeholder,
  onAddNew,
  className,
}: BindingFieldWithDynamicSchemaProps) {
  // Check if we need to resolve binding schema from registry
  // Priority: use bindingSchema if it's a dynamic app name, otherwise check bindingType
  const bindingSchemaIsDynamic = isDynamicBindingSchema(bindingSchema);
  const bindingTypeIsDynamic = isDynamicBindingSchema(bindingType);
  const needsDynamicResolution = bindingSchemaIsDynamic || bindingTypeIsDynamic;

  // Determine which value to use for dynamic resolution
  // - If bindingSchema is a dynamic app name (e.g., "@deco/database"), use it
  // - Otherwise if bindingType is a dynamic app name (e.g., "@deco/postgres"), use that
  const dynamicAppName = bindingSchemaIsDynamic
    ? (bindingSchema as string)
    : bindingTypeIsDynamic
      ? bindingType
      : undefined;

  // Use the hook to fetch binding schema from registry (only when needed)
  const { bindingSchema: registrySchema } =
    useBindingSchemaFromRegistry(dynamicAppName);

  // Determine the final binding to use:
  // 1. If dynamic resolution is needed and we got a result, use it
  // 2. If bindingSchema is an array of tools, use it directly
  // 3. If bindingSchema is a well-known binding name (string without /), use it directly
  // 4. Otherwise, undefined (no filtering)
  const resolvedBinding = (() => {
    if (needsDynamicResolution) {
      // Use resolved schema from registry, or undefined while loading
      return registrySchema;
    }
    if (Array.isArray(bindingSchema)) {
      // Direct array of tools
      return bindingSchema as Array<{
        name: string;
        inputSchema?: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
      }>;
    }
    if (typeof bindingSchema === "string") {
      // Well-known binding name (e.g., "LLMS", "AGENTS")
      return bindingSchema;
    }
    return undefined;
  })();

  return (
    <BindingSelector
      value={currentValue}
      onValueChange={onValueChange}
      placeholder={placeholder}
      binding={resolvedBinding}
      bindingType={bindingType}
      onAddNew={onAddNew}
      className={className}
    />
  );
}

interface BindingSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /**
   * Binding filter - can be a well-known binding name (e.g., "LLMS", "AGENTS", "MCP")
   * or a custom binding schema array for filtering connections.
   * Note: String values are case-insensitive (e.g., "llms" works the same as "LLMS").
   */
  binding?:
    | string
    | Array<{
        name: string;
        inputSchema?: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
      }>;
  /**
   * Specific MCP binding type for inline installation (e.g., "@deco/database").
   * When provided and starts with "@", clicking "Create connection" will
   * attempt to install the MCP directly from the registry.
   */
  bindingType?: string;
  /** Callback when "Create connection" is clicked (fallback when no bindingType) */
  onAddNew?: () => void;
  /** Optional className for the trigger */
  className?: string;
}

function BindingSelector({
  value,
  onValueChange,
  placeholder = "Select a connection...",
  binding,
  bindingType,
  onAddNew,
  className,
}: BindingSelectorProps) {
  const [isLocalInstalling, setIsLocalInstalling] = useState(false);
  const { installByBinding, isInstalling: isGlobalInstalling } =
    useInstallFromRegistry();

  const isInstalling = isLocalInstalling || isGlobalInstalling;

  // Fetch all connections from local collection
  const allConnections = useConnections();

  // Filter connections by binding (works with both well-known binding names and inline binding schemas)
  const filteredConnections = useBindingConnections({
    connections: allConnections,
    binding: binding,
  });

  const parsedBindingType = (() => {
    if (!bindingType?.startsWith("@")) return null;
    const [scope, appName] = bindingType.replace("@", "").split("/");
    return scope && appName ? { scope, appName } : null;
  })();

  // Apply additional filtering by bindingType and include selected connection if not in filtered list
  const connections = (() => {
    let result = filteredConnections;

    // Only filter by app_name/scopeName if:
    // 1. We have a parsedBindingType (@scope/appName format)
    // 2. AND we don't have a binding schema (tools array) for filtering
    // When we have a binding schema, the tools-based filtering is sufficient
    const hasBindingSchema = Array.isArray(binding) && binding.length > 0;

    if (parsedBindingType && !hasBindingSchema) {
      result = result.filter((conn) => {
        const connAppName = conn.app_name;
        const connScopeName = (conn.metadata as Record<string, unknown> | null)
          ?.scopeName as string | undefined;

        // Match by app_name and scopeName
        return (
          connAppName === parsedBindingType.appName &&
          connScopeName === parsedBindingType.scope
        );
      });
    }

    if (value && !result.some((c) => c.id === value)) {
      const selectedConnection = allConnections?.find((c) => c.id === value);
      if (selectedConnection) {
        return [selectedConnection, ...result];
      }
    }

    return result;
  })();

  // Check if we can do inline installation (bindingType starts with @)
  const canInstallInline = bindingType?.startsWith("@");

  const handleCreateConnection = async () => {
    // If we have a specific binding type that starts with @, try inline installation
    if (canInstallInline && bindingType) {
      setIsLocalInstalling(true);
      try {
        const result = await installByBinding(bindingType);
        if (result) {
          // Automatically select the newly connected MCP
          // The connection will appear in the list via allConnections
          onValueChange(result.id);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(`Failed to connect MCP: ${message}`);
      } finally {
        setIsLocalInstalling(false);
      }
      return;
    }

    // Fallback to onAddNew navigation
    onAddNew?.();
  };

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className ?? "w-[200px] h-8!"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {connections.length === 0 ? (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No connections found
          </div>
        ) : (
          connections.map((connection) => (
            <SelectItem key={connection.id} value={connection.id}>
              <div className="flex items-center gap-2">
                {connection.icon ? (
                  <img
                    src={connection.icon}
                    alt={connection.title}
                    className="w-4 h-4 rounded"
                  />
                ) : (
                  <div className="w-4 h-4 rounded bg-linear-to-br from-primary/20 to-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                    {connection.title.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span>{connection.title}</span>
              </div>
            </SelectItem>
          ))
        )}
        {(onAddNew || canInstallInline) && (
          <div className="border-t border-border">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCreateConnection();
              }}
              disabled={isInstalling}
              className="w-full flex items-center gap-2 px-2 py-2 hover:bg-muted rounded-md text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isInstalling ? (
                <>
                  <Icon
                    name="progress_activity"
                    size={16}
                    className="animate-spin"
                  />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <Icon name="add" size={16} />
                  <span>
                    {canInstallInline
                      ? "Connect MCP Server"
                      : "Create connection"}
                  </span>
                </>
              )}
            </button>
          </div>
        )}
      </SelectContent>
    </Select>
  );
}

/**
 * Custom ObjectFieldTemplate that handles binding fields specially
 */
function CustomObjectFieldTemplate(props: ObjectFieldTemplateProps) {
  const { schema, formData, title, description, registry } = props;
  const formContext = registry.formContext as FormContext | undefined;

  // Extract the field name from the first child element's content key/id
  // Each element in properties has a content with a key that contains the field path
  const firstChildKey = props.properties[0]?.content?.key as string | undefined;

  // Use title if available (it's the actual field name like "DATABASE")
  // Fall back to extracting from child key only if title is not available
  const fieldPath =
    title || (firstChildKey ? extractFieldName(firstChildKey) : "");

  // Check if this is a binding field (has __type or __binding in properties)
  if (isBindingField(schema as Record<string, unknown>)) {
    const { bindingType, bindingSchema } = getBindingInfo(
      schema as Record<string, unknown>,
    );
    const currentValue = (formData?.value as string) || "";

    const handleBindingChange = (newValue: string) => {
      const newFieldData = {
        ...formData,
        value: newValue,
        ...(bindingType && { __type: bindingType }),
      };
      formContext?.onFieldChange(fieldPath, newFieldData);
    };

    // Format title to Title Case
    // e.g., "DATABASE" -> "Database", "llm_model" -> "Llm Model"
    const formatTitle = (str: string) =>
      str
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

    const displayTitle = title ? formatTitle(title) : formatTitle(fieldPath);

    return (
      <div className="flex items-center gap-3 justify-between">
        <div className="flex-1 min-w-0">
          <label className="text-sm font-medium truncate block">
            {displayTitle}
          </label>
          {description && (
            <p className="text-xs text-muted-foreground truncate">
              {description}
            </p>
          )}
        </div>
        <BindingFieldWithDynamicSchema
          bindingSchema={bindingSchema}
          bindingType={bindingType}
          currentValue={currentValue}
          onValueChange={handleBindingChange}
          placeholder={`Select ${displayTitle.toLowerCase()}...`}
          onAddNew={() => formContext?.onAddNew()}
          className="w-[200px] shrink-0"
        />
      </div>
    );
  }

  // Default rendering for non-binding objects
  return (
    <div className="flex flex-col gap-4">
      {props.properties.map((element) => element.content)}
    </div>
  );
}

/**
 * Custom FieldTemplate for better styling
 */
function CustomFieldTemplate(props: FieldTemplateProps) {
  const { label, children, description, id, schema } = props;

  // Skip rendering for binding internal fields
  if (id.includes("__type") || id.includes("__binding")) {
    return null;
  }

  // For object types, let ObjectFieldTemplate handle everything
  if (schema.type === "object") {
    return children;
  }

  return (
    <div className="flex items-center gap-3 justify-between">
      <div className="flex-1 min-w-0">
        {label && (
          <label className="text-sm font-medium truncate block" htmlFor={id}>
            {label}
          </label>
        )}
        {description && (
          <p className="text-xs text-muted-foreground truncate">
            {description}
          </p>
        )}
      </div>
      <div className="w-[200px] shrink-0">{children}</div>
    </div>
  );
}

const TEMPLATES = {
  ObjectFieldTemplate: CustomObjectFieldTemplate,
  FieldTemplate: CustomFieldTemplate,
};

function McpConfigurationForm({
  formState,
  onFormStateChange,
  stateSchema,
}: McpConfigurationFormProps) {
  const { org } = useProjectContext();
  const navigate = useNavigate();

  const handleChange = (data: { formData?: Record<string, unknown> }) => {
    if (data.formData) {
      onFormStateChange(data.formData);
    }
  };

  const handleFieldChange = (fieldPath: string, value: unknown) => {
    const newFormState = { ...formState, [fieldPath]: value };
    onFormStateChange(newFormState);
  };

  const handleAddNew = () => {
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
      search: { action: "create" },
    });
  };

  const formContext: FormContext = {
    onFieldChange: handleFieldChange,
    formData: formState,
    onAddNew: handleAddNew,
  };

  return (
    <div className="flex flex-col h-full overflow-auto p-5">
      <RjsfForm
        schema={stateSchema}
        validator={validator}
        formData={formState}
        onChange={handleChange}
        formContext={formContext}
        liveValidate={false}
        showErrorList={false}
        templates={TEMPLATES}
      >
        {/* Hide default submit button */}
        <></>
      </RjsfForm>
    </div>
  );
}

interface OAuthAuthenticationStateProps {
  onAuthenticate: () => void | Promise<void>;
  buttonText?: string;
}

export function OAuthAuthenticationState({
  onAuthenticate,
  buttonText = "Authenticate",
}: OAuthAuthenticationStateProps) {
  return (
    <div className="w-3/5 min-w-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 max-w-md text-center">
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold">Authentication Required</h3>
          <p className="text-sm text-muted-foreground max-w-md text-center">
            This connection requires OAuth authentication to access resources.
          </p>
        </div>
        <Button onClick={onAuthenticate} size="lg">
          {buttonText}
        </Button>
      </div>
    </div>
  );
}

function SettingsTabContentWithMcpBinding(
  props: SettingsTabWithMcpBindingProps,
) {
  const config = useMcpConfiguration(props.connection.id);

  return <SettingsTabContentImpl {...props} {...config} />;
}

function SettingsTabContentWithoutMcpBinding(
  props: SettingsTabWithoutMcpBindingProps,
) {
  return <SettingsTabContentImpl {...props} />;
}

function SettingsRightPanel({
  hasMcpBinding,
  stateSchema,
  formState,
  onFormStateChange,
  onAuthenticate,
  isMCPAuthenticated,
}: {
  hasMcpBinding: boolean;
  stateSchema?: Record<string, unknown>;
  formState?: Record<string, unknown>;
  onFormStateChange: (state: Record<string, unknown>) => void;
  onAuthenticate: () => void | Promise<void>;
  isMCPAuthenticated: boolean;
}) {
  const hasProperties =
    stateSchema &&
    stateSchema.properties &&
    typeof stateSchema.properties === "object" &&
    Object.keys(stateSchema.properties).length > 0;

  if (!isMCPAuthenticated) {
    return <OAuthAuthenticationState onAuthenticate={onAuthenticate} />;
  }

  if (!hasMcpBinding) {
    return null;
  }

  if (!hasProperties || !stateSchema) {
    return (
      <div className="w-3/5 min-w-0 overflow-auto flex items-center justify-center">
        <EmptyState
          // TODO: Add better image
          // image={null}
          title="This server is all set!"
          description="No additional configuration is needed. Everything is ready to go."
        />
      </div>
    );
  }

  return (
    <div className="w-3/5 min-w-0 overflow-auto">
      <McpConfigurationForm
        stateSchema={stateSchema}
        formState={formState ?? {}}
        onFormStateChange={onFormStateChange}
      />
    </div>
  );
}

function SettingsTabContentImpl(props: SettingsTabContentImplProps) {
  const {
    connection,
    onUpdate,
    isUpdating,
    scopes,
    hasMcpBinding,
    stateSchema,
  } = props;
  const connectionActions = useConnectionActions();

  const form = useForm<ConnectionFormData>({
    resolver: zodResolver(connectionFormSchema),
    defaultValues: {
      title: connection.title,
      description: connection.description,
      connection_type: connection.connection_type,
      connection_url: connection.connection_url,
      connection_token: connection.connection_token,
      configuration_state: connection.configuration_state ?? {},
      configuration_scopes: scopes || connection.configuration_scopes || [],
    },
  });

  const formState = form.watch("configuration_state");
  const hasAnyChanges = form.formState.isDirty;

  const handleFormStateChange = (state: Record<string, unknown>) => {
    form.setValue("configuration_state", state, { shouldDirty: true });
  };

  const handleSave = async () => {
    const isValid = await form.trigger();

    if (!isValid) return;

    const data = form.getValues();

    await onUpdate(data);
    form.reset(data);
  };

  const handleAuthenticate = async () => {
    const { token, error } = await authenticateMcp(connection.connection_url);
    if (error || !token) {
      toast.error(`Authentication failed: ${error}`);
      return;
    }

    await connectionActions.update.mutateAsync({
      id: connection.id,
      data: { connection_token: token },
    });

    form.setValue("connection_token", token, { shouldDirty: false });

    toast.success("Authentication successful");
  };

  return (
    <>
      <ViewActions>
        {hasAnyChanges && (
          <Button onClick={handleSave} disabled={isUpdating} size="sm">
            {isUpdating && (
              <Icon
                name="progress_activity"
                size={16}
                className="mr-2 animate-spin"
              />
            )}
            Save Changes
          </Button>
        )}
      </ViewActions>

      <div className="flex h-full">
        {/* Left sidebar - Connection Settings (2/5) */}
        <div className="w-2/5 shrink-0 border-r border-border overflow-auto">
          <ConnectionSettingsFormUI form={form} connection={connection} />
        </div>

        {/* Right panel - MCP Configuration (3/5) */}
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="w-3/5 min-w-0 flex items-center justify-center">
                <Icon
                  name="progress_activity"
                  size={32}
                  className="animate-spin text-muted-foreground"
                />
              </div>
            }
          >
            <SettingsRightPanel
              hasMcpBinding={hasMcpBinding}
              stateSchema={stateSchema}
              formState={formState ?? undefined}
              onFormStateChange={handleFormStateChange}
              onAuthenticate={handleAuthenticate}
              isMCPAuthenticated={props.isMCPAuthenticated}
            />
          </Suspense>
        </ErrorBoundary>
      </div>
    </>
  );
}

function ConnectionSettingsFormUI({
  form,
  connection,
}: {
  form: ReturnType<typeof useForm<ConnectionFormData>>;
  connection: ConnectionEntity;
}) {
  return (
    <Form {...form}>
      <div className="flex flex-col">
        {/* Header section - Icon, Title, Description */}
        <div className="flex flex-col gap-4 p-5 border-b border-border">
          <IntegrationIcon
            icon={connection.icon}
            name={connection.title}
            size="lg"
            className="shadow-sm"
          />
          <div className="flex flex-col">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem className="w-full space-y-0">
                  <div className="flex items-center gap-2.5">
                    <FormControl>
                      <Input
                        {...field}
                        className="h-auto text-xl font-medium leading-7 px-0 border-transparent hover:border-input focus:border-input bg-transparent transition-all"
                        placeholder="Connection Name"
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="w-full space-y-0">
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value || ""}
                      className="h-auto text-base text-muted-foreground leading-6 px-0 border-transparent hover:border-input focus:border-input bg-transparent transition-all"
                      placeholder="Add a description..."
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Connection section */}
        <div className="flex flex-col gap-4 p-5 border-b border-border">
          <div className="flex flex-col gap-2">
            <FormLabel className="text-sm font-medium">Connection</FormLabel>
            <div className="flex">
              <FormField
                control={form.control}
                name="connection_type"
                render={({ field }) => (
                  <FormItem className="space-y-0">
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="h-10 rounded-r-none border-r-0 bg-muted focus:ring-0 focus:ring-offset-0 rounded-l-lg">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="HTTP">HTTP</SelectItem>
                        <SelectItem value="SSE">SSE</SelectItem>
                        <SelectItem value="Websocket">Websocket</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="connection_url"
                render={({ field }) => (
                  <FormItem className="flex-1 space-y-0">
                    <FormControl>
                      <Input
                        placeholder="https://example.com/mcp"
                        {...field}
                        className="h-10 rounded-l-none rounded-r-xl focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="connection_type"
              render={() => <FormMessage />}
            />
            <FormField
              control={form.control}
              name="connection_url"
              render={() => <FormMessage />}
            />
          </div>

          <FormField
            control={form.control}
            name="connection_token"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2">
                <FormLabel className="text-sm font-medium">Token</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder={
                      connection.connection_token
                        ? "••••••••"
                        : "Enter access token..."
                    }
                    {...field}
                    value={field.value || ""}
                    className="h-10 rounded-lg"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Last Updated section */}
        <div className="flex items-center gap-4 p-5 border-b border-border">
          <span className="flex-1 text-sm text-foreground">Last Updated</span>
          <span className="font-mono text-sm uppercase text-muted-foreground">
            {connection.updated_at
              ? formatDistanceToNow(new Date(connection.updated_at), {
                  addSuffix: false,
                })
              : "Unknown"}
          </span>
        </div>
      </div>
      <CursorIDEIntegration connection={connection} />
    </Form>
  );
}

function CursorIDEIntegration({
  connection,
}: {
  connection: ConnectionEntity;
}) {
  // Generate MCP config for Cursor - uses Mesh proxy URL
  // Get the base URL (current window origin)
  const baseUrl = window.location.origin;

  // Build the Mesh proxy URL: {baseUrl}/mcp/{connectionId}
  const proxyUrl = `${baseUrl}/mcp/${connection.id}`;

  const mcpConfig = {
    url: proxyUrl,
  };

  return (
    <div className="space-y-4 p-5">
      <div>
        <h4 className="text-sm font-medium text-foreground mb-1">
          Install in Cursor IDE
        </h4>
        <p className="text-sm text-muted-foreground">
          Add this MCP Server to Cursor via the Mesh HTTP proxy. Authentication
          and permissions are handled automatically through Mesh.
        </p>
      </div>
    </div>
  );
}

export function SettingsTab(props: SettingsTabProps) {
  const mcpBindingConnections = useBindingConnections({
    connections: [props.connection],
    binding: "MCP",
  });
  const hasMcpBinding = mcpBindingConnections.length > 0;

  return (
    <div className="flex-1">
      {hasMcpBinding ? (
        <SettingsTabContentWithMcpBinding {...props} hasMcpBinding={true} />
      ) : (
        <SettingsTabContentWithoutMcpBinding {...props} hasMcpBinding={false} />
      )}
    </div>
  );
}

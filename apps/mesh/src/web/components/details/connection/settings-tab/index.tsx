import { createToolCaller } from "@/tools/client";
import type {
  ConnectionEntity,
  StdioConnectionParameters,
  HttpConnectionParameters,
} from "@/tools/connection/schema";
import { isStdioParameters } from "@/tools/connection/schema";
import {
  envVarsToRecord,
  recordToEnvVars,
  type EnvVar,
} from "@/web/components/env-vars-editor";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary.tsx";
import { useConnectionActions } from "@/web/hooks/collections/use-connection";
import { useBindingConnections } from "@/web/hooks/use-binding";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { authenticateMcp } from "@/web/lib/mcp-oauth";
import { KEYS } from "@/web/lib/query-keys";
import { PinToSidebarButton } from "@/web/components/pin-to-sidebar-button";
import { Button } from "@deco/ui/components/button.tsx";
import { Key01, File06, Loading01 } from "@untitledui/icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ViewActions } from "../../layout";
import { ConnectionSettingsFormUI } from "./connection-settings-form-ui";
import { McpConfigurationForm } from "./mcp-configuration-form";
import { connectionFormSchema, type ConnectionFormData } from "./schema";

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
  // Find the package (skip -y flag)
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

  // Parse args from space-separated string (basic parsing)
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
 * Convert connection entity to form values
 */
function connectionToFormValues(
  connection: ConnectionEntity,
  scopes?: string[],
): ConnectionFormData {
  const baseFields = {
    title: connection.title,
    description: connection.description ?? "",
    configuration_state: connection.configuration_state ?? {},
    configuration_scopes: scopes || connection.configuration_scopes || [],
  };

  // Check if it's a STDIO connection
  if (
    connection.connection_type === "STDIO" &&
    isStdioParameters(connection.connection_headers)
  ) {
    const stdioParams = connection.connection_headers;
    const envVars = recordToEnvVars(stdioParams.envVars);

    // Check if it's an NPX command
    if (isNpxCommand(stdioParams)) {
      const npxPackage = parseStdioToNpx(stdioParams);
      return {
        ...baseFields,
        ui_type: "NPX",
        connection_url: "",
        connection_token: null,
        npx_package: npxPackage,
        stdio_command: "",
        stdio_args: "",
        stdio_cwd: "",
        env_vars: envVars,
      };
    }

    // Custom STDIO command
    const customData = parseStdioToCustom(stdioParams);
    return {
      ...baseFields,
      ui_type: "STDIO",
      connection_url: "",
      connection_token: null,
      npx_package: "",
      stdio_command: customData.command,
      stdio_args: customData.args,
      stdio_cwd: customData.cwd,
      env_vars: envVars,
    };
  }

  // HTTP/SSE/Websocket connection
  return {
    ...baseFields,
    ui_type: connection.connection_type as "HTTP" | "SSE" | "Websocket",
    connection_url: connection.connection_url ?? "",
    connection_token: null, // Don't pre-fill token for security
    npx_package: "",
    stdio_command: "",
    stdio_args: "",
    stdio_cwd: "",
    env_vars: [],
  };
}

/**
 * Convert form values back to connection entity update
 */
function formValuesToConnectionUpdate(
  data: ConnectionFormData,
): Partial<ConnectionEntity> {
  let connectionType: "HTTP" | "SSE" | "Websocket" | "STDIO";
  let connectionUrl: string | null = null;
  let connectionToken: string | null = null;
  let connectionParameters:
    | StdioConnectionParameters
    | HttpConnectionParameters
    | null = null;

  if (data.ui_type === "NPX") {
    connectionType = "STDIO";
    connectionUrl = ""; // STDIO doesn't use URL
    connectionParameters = buildNpxParameters(
      data.npx_package || "",
      data.env_vars || [],
    );
  } else if (data.ui_type === "STDIO") {
    connectionType = "STDIO";
    connectionUrl = ""; // STDIO doesn't use URL
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

  return {
    title: data.title,
    description: data.description || null,
    connection_type: connectionType,
    connection_url: connectionUrl,
    ...(connectionToken && { connection_token: connectionToken }),
    ...(connectionParameters && { connection_headers: connectionParameters }),
    configuration_state: data.configuration_state ?? null,
    configuration_scopes: data.configuration_scopes ?? null,
  };
}

interface SettingsTabProps {
  connection: ConnectionEntity;
  onUpdate: (connection: Partial<ConnectionEntity>) => Promise<void>;
  isUpdating: boolean;
  isMCPAuthenticated: boolean;
  supportsOAuth: boolean;
  isServerError?: boolean;
  onViewReadme?: () => void;
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

interface ManualAuthRequiredStateProps {
  hasReadme: boolean;
  onViewReadme?: () => void;
}

export function ManualAuthRequiredState({
  hasReadme,
  onViewReadme,
}: ManualAuthRequiredStateProps) {
  return (
    <div className="w-3/5 min-w-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 max-w-md text-center">
        <Key01 size={48} className="text-muted-foreground" />
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold">
            Manual Authentication Required
          </h3>
          <p className="text-sm text-muted-foreground max-w-md text-center">
            This server requires an API key or token that must be configured
            manually. Check the server's documentation for instructions on
            obtaining credentials.
          </p>
        </div>
        {hasReadme && onViewReadme && (
          <Button onClick={onViewReadme} variant="outline" size="lg">
            <File06 size={18} className="mr-2" />
            View README
          </Button>
        )}
      </div>
    </div>
  );
}

function ServerErrorState() {
  return (
    <div className="w-3/5 min-w-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 max-w-md text-center">
        <img
          src="/empty-state-error.svg"
          alt=""
          width={160}
          height={160}
          aria-hidden="true"
        />
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold">Server Error</h3>
          <p className="text-sm text-muted-foreground max-w-md text-center">
            The MCP server is currently experiencing issues. Please try again
            later or check the server's status.
          </p>
        </div>
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
  onViewReadme,
  isMCPAuthenticated,
  supportsOAuth,
  isServerError,
  hasReadme,
}: {
  hasMcpBinding: boolean;
  stateSchema?: Record<string, unknown>;
  formState?: Record<string, unknown>;
  onFormStateChange: (state: Record<string, unknown>) => void;
  onAuthenticate: () => void | Promise<void>;
  onViewReadme?: () => void;
  isMCPAuthenticated: boolean;
  supportsOAuth: boolean;
  isServerError?: boolean;
  hasReadme: boolean;
}) {
  const hasProperties =
    stateSchema &&
    stateSchema.properties &&
    typeof stateSchema.properties === "object" &&
    Object.keys(stateSchema.properties).length > 0;

  if (!isMCPAuthenticated) {
    // Show server error state if there was a 5xx error
    if (isServerError) {
      return <ServerErrorState />;
    }
    // Show different UI based on whether the server supports OAuth
    if (supportsOAuth) {
      return <OAuthAuthenticationState onAuthenticate={onAuthenticate} />;
    }
    return (
      <ManualAuthRequiredState
        hasReadme={hasReadme}
        onViewReadme={onViewReadme}
      />
    );
  }

  if (!hasMcpBinding) {
    return null;
  }

  if (!hasProperties || !stateSchema) {
    return (
      <div className="w-3/5 min-w-0 overflow-auto flex items-center justify-center">
        <EmptyState
          image={
            <img
              src="/empty-state-success-muted.svg"
              alt=""
              width={220}
              height={200}
              aria-hidden="true"
            />
          }
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
    onViewReadme,
  } = props;

  const connectionActions = useConnectionActions();
  const queryClient = useQueryClient();
  const routerState = useRouterState();
  const url = routerState.location.href;

  // Check if connection has README
  const repository = connection?.metadata?.repository as
    | { url?: string }
    | undefined;
  const hasReadme = !!repository?.url;

  const form = useForm<ConnectionFormData>({
    resolver: zodResolver(connectionFormSchema),
    values: connectionToFormValues(connection, scopes),
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
    const updateData = formValuesToConnectionUpdate(data);
    await onUpdate(updateData);
    form.reset(data);
  };

  const handleAuthenticate = async () => {
    const { token, error } = await authenticateMcp({
      connectionId: connection.id,
    });
    if (error || !token) {
      toast.error(`Authentication failed: ${error}`);
      return;
    }

    await connectionActions.update.mutateAsync({
      id: connection.id,
      data: { connection_token: token },
    });

    // Invalidate auth status query to trigger UI refresh
    const mcpProxyUrl = new URL(
      `/mcp/${connection.id}`,
      window.location.origin,
    );
    await queryClient.invalidateQueries({
      queryKey: KEYS.isMCPAuthenticated(mcpProxyUrl.href, null),
    });

    toast.success("Authentication successful");
  };

  return (
    <>
      <ViewActions>
        <PinToSidebarButton
          title={`${connection.title}: Settings`}
          url={url}
          icon={connection.icon ?? "settings"}
        />
        {hasAnyChanges && (
          <Button
            onClick={handleSave}
            disabled={isUpdating}
            size="sm"
            className="h-7"
          >
            {isUpdating && (
              <Loading01 size={16} className="mr-2 animate-spin" />
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
                <Loading01
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
              onViewReadme={onViewReadme}
              isMCPAuthenticated={props.isMCPAuthenticated}
              supportsOAuth={props.supportsOAuth}
              isServerError={props.isServerError}
              hasReadme={hasReadme}
            />
          </Suspense>
        </ErrorBoundary>
      </div>
    </>
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

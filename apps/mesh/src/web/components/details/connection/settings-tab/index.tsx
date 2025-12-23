import { createToolCaller } from "@/tools/client";
import type { ConnectionEntity } from "@/tools/connection/schema";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary.tsx";
import { useConnectionActions } from "@/web/hooks/collections/use-connection";
import { useBindingConnections } from "@/web/hooks/use-binding";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { authenticateMcp } from "@/web/lib/mcp-oauth";
import { Button } from "@deco/ui/components/button.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { zodResolver } from "@hookform/resolvers/zod";
import { Suspense } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ViewActions } from "../../layout";
import { ConnectionSettingsFormUI } from "./connection-settings-form-ui";
import { McpConfigurationForm } from "./mcp-configuration-form";
import { connectionFormSchema, type ConnectionFormData } from "./schema";

interface SettingsTabProps {
  connection: ConnectionEntity;
  onUpdate: (connection: Partial<ConnectionEntity>) => Promise<void>;
  isUpdating: boolean;
  isMCPAuthenticated: boolean;
  supportsOAuth: boolean;
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
        <Icon name="key" size={48} className="text-muted-foreground" />
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
            <Icon name="description" size={18} className="mr-2" />
            View README
          </Button>
        )}
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
  hasReadme: boolean;
}) {
  const hasProperties =
    stateSchema &&
    stateSchema.properties &&
    typeof stateSchema.properties === "object" &&
    Object.keys(stateSchema.properties).length > 0;

  if (!isMCPAuthenticated) {
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

  // Check if connection has README
  const repository = connection?.metadata?.repository as
    | { url?: string }
    | undefined;
  const hasReadme = !!repository?.url;

  const form = useForm<ConnectionFormData>({
    resolver: zodResolver(connectionFormSchema),
    values: {
      title: connection.title,
      description: connection.description ?? "",
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

    toast.success("Authentication successful");
  };

  return (
    <>
      <ViewActions>
        {hasAnyChanges && (
          <Button
            onClick={handleSave}
            disabled={isUpdating}
            size="sm"
            className="h-7"
          >
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
              supportsOAuth={props.supportsOAuth}
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

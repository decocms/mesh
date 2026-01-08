import type { ConnectionEntity } from "@/tools/connection/schema";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import {
  useConnection,
  useConnectionActions,
} from "@/web/hooks/collections/use-connection";
import { useCollectionBindings } from "@/web/hooks/use-binding";
import { useConnectionDetailTabs } from "@/web/hooks/use-connection-detail-tabs";
import { useMCPAuthStatus } from "@/web/hooks/use-mcp-auth-status";
import { useConnectionsPrompts } from "@/web/hooks/use-connection-prompts";
import { useConnectionsResources } from "@/web/hooks/use-connection-resources";
import { Button } from "@deco/ui/components/button.tsx";
import { Loading01 } from "@untitledui/icons";
import { useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { Suspense } from "react";
import { ViewLayout } from "../layout";
import { CollectionTab } from "./collection-tab";
import { PromptsTab } from "./prompts-tab";
import { ReadmeTab } from "./readme-tab";
import { ResourcesTab } from "./resources-tab";
import { SettingsTab } from "./settings-tab";
import { ToolsTab } from "./tools-tab";

function ConnectionInspectorViewWithConnection({
  connection,
  connectionId,
  org,
  collections,
  onUpdate,
  isUpdating,
  prompts,
  resources,
}: {
  connection: ConnectionEntity;
  connectionId: string;
  org: string;
  collections: ReturnType<typeof useCollectionBindings>;
  onUpdate: (connection: Partial<ConnectionEntity>) => Promise<void>;
  isUpdating: boolean;
  prompts: Array<{ name: string; description?: string }>;
  resources: Array<{
    uri: string;
    name?: string;
    description?: string;
    mimeType?: string;
  }>;
}) {
  const router = useRouter();

  const authStatus = useMCPAuthStatus({
    connectionId: connectionId,
  });
  const isMCPAuthenticated = authStatus.isAuthenticated;

  // Check if connection has repository info for README tab (stored in metadata)
  const repository = connection?.metadata?.repository as
    | { url?: string; source?: string; subfolder?: string }
    | undefined;
  const hasRepository = !!repository?.url;

  // Use centralized tab hook
  const { activeTabId, setTab } = useConnectionDetailTabs({
    connection,
    prompts,
    resources,
  });

  const activeCollection = (collections || []).find(
    (c) => c.name === activeTabId,
  );

  return (
    <ViewLayout onBack={() => router.history.back()}>
      <div className="flex h-full w-full bg-background overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 bg-background overflow-auto">
          <ErrorBoundary key={activeTabId}>
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
              {activeTabId === "tools" ? (
                <ToolsTab
                  tools={connection.tools ?? undefined}
                  connectionId={connectionId}
                  org={org}
                />
              ) : activeTabId === "prompts" ? (
                <PromptsTab
                  prompts={prompts}
                  connectionId={connectionId}
                  org={org}
                />
              ) : activeTabId === "resources" ? (
                <ResourcesTab
                  resources={resources}
                  connectionId={connectionId}
                  org={org}
                />
              ) : activeTabId === "settings" ? (
                <SettingsTab
                  connection={connection}
                  onUpdate={onUpdate}
                  isUpdating={isUpdating}
                  isMCPAuthenticated={isMCPAuthenticated}
                  supportsOAuth={authStatus.supportsOAuth}
                  isServerError={authStatus.isServerError}
                  onViewReadme={
                    hasRepository ? () => setTab("readme") : undefined
                  }
                />
              ) : activeTabId === "readme" && hasRepository ? (
                <ReadmeTab repository={repository} />
              ) : activeCollection && isMCPAuthenticated ? (
                <CollectionTab
                  key={activeTabId}
                  connectionId={connectionId}
                  org={org}
                  activeCollection={activeCollection}
                />
              ) : (
                <EmptyState
                  title="Collection not found"
                  description="This collection may have been deleted or you may not have access."
                />
              )}
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </ViewLayout>
  );
}

function ConnectionInspectorViewContent() {
  const navigate = useNavigate();
  const { connectionId, org } = useParams({ strict: false }) as {
    connectionId: string;
    org: string;
  };

  const connection = useConnection(connectionId);
  const actions = useConnectionActions();

  // Detect collection bindings
  const collections = useCollectionBindings(connection ?? undefined);

  // Fetch prompts and resources for this connection
  const { promptsMap } = useConnectionsPrompts([connectionId]);
  const { resourcesMap } = useConnectionsResources([connectionId]);

  const prompts = promptsMap.get(connectionId) ?? [];
  const resources = resourcesMap.get(connectionId) ?? [];

  // Update connection handler
  const handleUpdateConnection = async (
    updatedConnection: Partial<ConnectionEntity>,
  ) => {
    await actions.update.mutateAsync({
      id: connectionId,
      data: updatedConnection,
    });
  };

  if (!connection) {
    return (
      <div className="flex h-full w-full bg-background">
        <EmptyState
          title="Connection not found"
          description="This connection may have been deleted or you may not have access."
          actions={
            <Button
              variant="outline"
              onClick={() =>
                navigate({
                  to: "/$org/mcps",
                  params: { org: org as string },
                })
              }
            >
              Back to connections
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <ConnectionInspectorViewWithConnection
      org={org}
      connection={connection}
      connectionId={connectionId}
      collections={collections}
      onUpdate={handleUpdateConnection}
      isUpdating={actions.update.isPending}
      prompts={prompts}
      resources={resources}
    />
  );
}

export default function ConnectionInspectorView() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center bg-background">
            <Loading01
              size={32}
              className="animate-spin text-muted-foreground"
            />
          </div>
        }
      >
        <ConnectionInspectorViewContent />
      </Suspense>
    </ErrorBoundary>
  );
}

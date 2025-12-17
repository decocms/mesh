import type { ConnectionEntity } from "@/tools/connection/schema";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import {
  useConnection,
  useConnectionActions,
} from "@/web/hooks/collections/use-connection";
import { useCollectionBindings } from "@/web/hooks/use-binding";
import { useIsMCPAuthenticated } from "@/web/hooks/use-oauth-token-validation";
import { Button } from "@deco/ui/components/button.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { ResourceTabs } from "@deco/ui/components/resource-tabs.tsx";
import {
  useNavigate,
  useParams,
  useRouter,
  useSearch,
} from "@tanstack/react-router";
import { Suspense } from "react";
import { ViewLayout, ViewTabs } from "../layout";
import { CollectionTab } from "./collection-tab";
import { ReadmeTab } from "./readme-tab";
import { SettingsTab } from "./settings-tab";
import { ToolsTab } from "./tools-tab";

function ConnectionInspectorViewWithConnection({
  connection,
  connectionId,
  org,
  requestedTabId,
  collections,
  onUpdate,
  isUpdating,
}: {
  connection: ConnectionEntity;
  connectionId: string;
  org: string;
  requestedTabId: string;
  collections: ReturnType<typeof useCollectionBindings>;
  onUpdate: (connection: Partial<ConnectionEntity>) => Promise<void>;
  isUpdating: boolean;
}) {
  const router = useRouter();
  const navigate = useNavigate({ from: "/$org/mcps/$connectionId" });

  const isMCPAuthenticated = useIsMCPAuthenticated({
    url: connection.connection_url,
    token: connection.connection_token,
  });

  // Check if connection has repository info for README tab (stored in metadata)
  const repository = connection?.metadata?.repository as
    | { url?: string; source?: string; subfolder?: string }
    | undefined;
  const hasRepository = !!repository?.url;

  const toolsCount = connection?.tools?.length ?? 0;

  const tabs = [
    { id: "settings", label: "Settings" },
    ...(isMCPAuthenticated && toolsCount > 0
      ? [{ id: "tools", label: "Tools", count: toolsCount }]
      : []),
    ...(isMCPAuthenticated
      ? (collections || []).map((c) => ({ id: c.name, label: c.displayName }))
      : []),
    ...(hasRepository ? [{ id: "readme", label: "README" }] : []),
  ];

  const activeTabId = tabs.some((t) => t.id === requestedTabId)
    ? requestedTabId
    : "settings";

  const handleTabChange = (tabId: string) => {
    navigate({ search: (prev) => ({ ...prev, tab: tabId }), replace: true });
  };

  const activeCollection = (collections || []).find(
    (c) => c.name === activeTabId,
  );

  return (
    <ViewLayout onBack={() => router.history.back()}>
      <ViewTabs>
        <ResourceTabs
          tabs={tabs}
          activeTab={activeTabId}
          onTabChange={handleTabChange}
        />
      </ViewTabs>
      <div className="flex h-full w-full bg-background overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 bg-background overflow-auto">
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
              {activeTabId === "tools" ? (
                <ToolsTab
                  tools={connection.tools ?? undefined}
                  connectionId={connectionId}
                  org={org}
                />
              ) : activeTabId === "settings" ? (
                <SettingsTab
                  connection={connection}
                  onUpdate={onUpdate}
                  isUpdating={isUpdating}
                  isMCPAuthenticated={isMCPAuthenticated}
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
  const navigate = useNavigate({ from: "/$org/mcps/$connectionId" });
  const { connectionId, org } = useParams({
    from: "/shell/$org/mcps/$connectionId",
  });

  // We can use search params for active tab if we want persistent tabs
  const search = useSearch({ from: "/shell/$org/mcps/$connectionId" });
  const requestedTabId = search.tab || "settings";

  const connection = useConnection(connectionId);
  const actions = useConnectionActions();

  // Detect collection bindings
  const collections = useCollectionBindings(connection ?? undefined);

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
      connection={connection}
      connectionId={connectionId}
      org={org}
      requestedTabId={requestedTabId}
      collections={collections}
      onUpdate={handleUpdateConnection}
      isUpdating={actions.update.isPending}
    />
  );
}

export default function ConnectionInspectorView() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center bg-background">
            <Icon
              name="progress_activity"
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

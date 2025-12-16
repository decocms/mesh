import type { ConnectionEntity } from "@/tools/connection/schema";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import {
  useConnection,
  useConnectionActions,
} from "@/web/hooks/collections/use-connection";
import { useCollectionBindings } from "@/web/hooks/use-binding";
import { normalizeUrl } from "@/web/utils/normalize-url";
import { Button } from "@deco/ui/components/button.tsx";
import { ResourceTabs } from "@deco/ui/components/resource-tabs.tsx";
import {
  useNavigate,
  useParams,
  useRouter,
  useSearch,
} from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Suspense } from "react";
import { useMcp } from "use-mcp/react";
import { ViewLayout, ViewTabs } from "../layout";
import { CollectionTab } from "./collection-tab";
import { ReadmeTab } from "./readme-tab";
import { SettingsTab } from "./settings-tab";
import { ToolsTab } from "./tools-tab";

function ConnectionInspectorViewContent() {
  const router = useRouter();
  const navigate = useNavigate({ from: "/$org/mcps/$connectionId" });
  const { connectionId, org } = useParams({
    from: "/shell/$org/mcps/$connectionId",
  });

  // We can use search params for active tab if we want persistent tabs
  const search = useSearch({ from: "/shell/$org/mcps/$connectionId" });
  const activeTabId = search.tab || "settings";

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

  // Initialize MCP connection
  const normalizedUrl = connection?.connection_url
    ? normalizeUrl(connection.connection_url)
    : "";

  const mcp = useMcp({
    url: normalizedUrl,
    clientName: "MCP Mesh Inspector",
    clientUri: window.location.origin,
    callbackUrl: `${window.location.origin}/oauth/callback`,
    debug: false,
    preventAutoAuth: true,
    autoReconnect: false,
    autoRetry: false,
  });

  // Check if connection has repository info for README tab (stored in metadata)
  const repository = connection?.metadata?.repository as
    | { url?: string; source?: string; subfolder?: string }
    | undefined;
  const hasRepository = !!repository?.url;

  const tabs = [
    { id: "settings", label: "Settings" },
    { id: "tools", label: "Tools", count: mcp.tools?.length ?? 0 },
    ...(collections || []).map((c) => ({ id: c.name, label: c.displayName })),
    ...(hasRepository ? [{ id: "readme", label: "README" }] : []),
  ];

  const handleTabChange = (tabId: string) => {
    navigate({ search: (prev) => ({ ...prev, tab: tabId }), replace: true });
  };

  const activeCollection = collections.find((c) => c.name === activeTabId);

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
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              }
            >
              {activeTabId === "tools" ? (
                <ToolsTab
                  tools={mcp.tools}
                  connectionId={connectionId}
                  org={org}
                />
              ) : activeTabId === "settings" ? (
                <SettingsTab
                  connection={connection}
                  onUpdate={handleUpdateConnection}
                  isUpdating={actions.update.isPending}
                />
              ) : activeTabId === "readme" && hasRepository ? (
                <ReadmeTab repository={repository} />
              ) : activeCollection ? (
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

export default function ConnectionInspectorView() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center bg-background">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <ConnectionInspectorViewContent />
      </Suspense>
    </ErrorBoundary>
  );
}

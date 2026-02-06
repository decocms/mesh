import { CollectionTab } from "@/web/components/details/connection/collection-tab";
import { BindingCollectionEmptyState } from "@/web/components/binding-collection-empty-state";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { Page } from "@/web/components/page";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@deco/ui/components/breadcrumb.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import {
  useBindingConnections,
  useCollectionBindings,
} from "@/web/hooks/use-binding";
import {
  ORG_ADMIN_PROJECT_SLUG,
  useConnections,
  useProjectContext,
  type ConnectionCreateData,
} from "@decocms/mesh-sdk";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Loading01,
  RefreshCcw01,
  Settings02,
} from "@untitledui/icons";
import { Suspense, useState } from "react";

interface BindingCollectionViewProps {
  bindingName: string; // e.g., "ASSISTANTS", "WORKFLOW"
  collectionName: string; // e.g., "assistant", "workflow"
  title: string; // Display title (e.g., "Assistants", "Workflows")
  emptyState: {
    title: string;
    description: string;
    imageSrc?: string;
  };
  wellKnownMcp: ConnectionCreateData;
}

export function BindingCollectionView({
  bindingName,
  collectionName,
  title,
  emptyState,
  wellKnownMcp,
}: BindingCollectionViewProps) {
  const { org } = useProjectContext();
  const allConnections = useConnections();

  // Filter connections that implement the binding
  const bindingConnections = useBindingConnections({
    connections: allConnections,
    binding: bindingName,
  });

  // Get the first connection (or undefined if none found)
  const connection = bindingConnections[0];

  // Get collections from the connection
  const collections = useCollectionBindings(connection);

  // Find the specific collection we're looking for
  const activeCollection = collections.find(
    (col) => col.name.toLowerCase() === collectionName.toLowerCase(),
  );

  // Track if MCP was just installed to show the collection UI
  const [installedConnectionId, setInstalledConnectionId] = useState<
    string | null
  >(null);

  // Show collection UI if we have a connection with the collection
  const shouldShowCollection =
    connection && activeCollection && (connection.id || installedConnectionId);

  return (
    <Page>
      <Page.Header>
        <Page.Header.Left>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>{title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Page.Header.Left>
      </Page.Header>

      <Page.Content>
        <ErrorBoundary
          fallback={({ error, resetError }) => (
            <div className="flex-1 flex flex-col items-center justify-center h-full p-6 text-center space-y-4">
              <div className="bg-destructive/10 p-3 rounded-full">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-medium">
                  Failed to load {title.toLowerCase()}
                </h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  {error?.message ||
                    "Unable to connect to the server. Please check that it is running and accessible."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={resetError}>
                  <RefreshCcw01 className="size-4" />
                  Try again
                </Button>
                {connection && (
                  <Button variant="outline" asChild>
                    <Link
                      to="/$org/$project/mcps/$connectionId"
                      params={{
                        org: org.slug,
                        project: ORG_ADMIN_PROJECT_SLUG,
                        connectionId: connection.id,
                      }}
                      search={{ tab: "settings" }}
                    >
                      <Settings02 className="size-4" />
                      Connection Settings
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        >
          <Suspense
            fallback={
              <div className="flex flex-col items-center justify-center h-full">
                <Loading01
                  size={32}
                  className="animate-spin text-muted-foreground mb-4"
                />
                <p className="text-sm text-muted-foreground">
                  Loading {title.toLowerCase()}...
                </p>
              </div>
            }
          >
            {shouldShowCollection ? (
              <CollectionTab
                connectionId={connection.id}
                org={org.slug}
                activeCollection={activeCollection}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full">
                <BindingCollectionEmptyState
                  title={emptyState.title}
                  description={emptyState.description}
                  wellKnownMcp={wellKnownMcp}
                  imageSrc={emptyState.imageSrc}
                  onConnected={(connectionId) => {
                    setInstalledConnectionId(connectionId);
                  }}
                />
              </div>
            )}
          </Suspense>
        </ErrorBoundary>
      </Page.Content>
    </Page>
  );
}

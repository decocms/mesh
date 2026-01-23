import { CollectionTab } from "@/web/components/details/connection/collection-tab";
import { BindingCollectionEmptyState } from "@/web/components/binding-collection-empty-state";
import { CollectionHeader } from "@/web/components/collections/collection-header";
import {
  useBindingConnections,
  useCollectionBindings,
} from "@/web/hooks/use-binding";
import {
  useConnections,
  useProjectContext,
  type ConnectionCreateData,
} from "@decocms/mesh-sdk";
import { Loading01 } from "@untitledui/icons";
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
    <div className="h-full flex flex-col overflow-hidden">
      <CollectionHeader title={title} />

      <div className="h-full flex flex-col overflow-hidden">
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
      </div>
    </div>
  );
}

/**
 * Files Page
 *
 * A dedicated page for browsing files from any File Storage binding connection.
 * Reuses the same CollectionTab component used in connection detail pages.
 */

import { Suspense } from "react";
import { CollectionHeader } from "@/web/components/collections/collection-header";
import { CollectionTab } from "@/web/components/details/connection/collection-tab";
import { EmptyState } from "@/web/components/empty-state";
import {
  useConnections,
  useConnection,
} from "@/web/hooks/collections/use-connection";
import {
  useFileStorageConnections,
  useCollectionBindings,
} from "@/web/hooks/use-binding";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { FileStorageConnectionSelect } from "@/web/components/file-storage-connection-select";
import { Loading01, Folder } from "@untitledui/icons";

export default function FilesPage() {
  const { org } = useProjectContext();
  const allConnections = useConnections();

  // Filter to only show file storage connections
  const fileStorageConnections = useFileStorageConnections(allConnections);

  const connectionOptions = fileStorageConnections.map((c) => ({
    id: c.id,
    name: c.title,
    icon: c.icon || undefined,
  }));

  // Persist selected file storage in localStorage (scoped by org)
  const [selectedConnectionId, setSelectedConnectionId] =
    useLocalStorage<string>(
      LOCALSTORAGE_KEYS.selectedFileStorage(org.slug),
      () => "",
    );

  const selectedConnection = fileStorageConnections.find(
    (c) => c.id === selectedConnectionId,
  );

  // If there's only one connection, use it; otherwise use the selected one if it still exists.
  const effectiveConnectionId =
    selectedConnection?.id || fileStorageConnections[0]?.id || "";

  const hasFileStorageConnections = fileStorageConnections.length > 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <CollectionHeader
        title="Files"
        ctaButton={
          hasFileStorageConnections ? (
            <FileStorageConnectionSelect
              connections={connectionOptions}
              value={effectiveConnectionId}
              onValueChange={setSelectedConnectionId}
              placeholder="Select storage..."
            />
          ) : null
        }
      />

      {/* Content Section */}
      <div className="h-full flex flex-col overflow-hidden">
        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center h-full">
              <Loading01
                size={32}
                className="animate-spin text-muted-foreground mb-4"
              />
              <p className="text-sm text-muted-foreground">Loading files...</p>
            </div>
          }
        >
          {effectiveConnectionId ? (
            <FilesContent connectionId={effectiveConnectionId} org={org.slug} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              <EmptyState
                image={<Folder size={48} className="text-muted-foreground" />}
                title="No File Storage Connected"
                description="Add a File Storage binding to browse and manage files"
              />
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Inner component that loads the connection and renders the FILES collection
 */
function FilesContent({
  connectionId,
  org,
}: {
  connectionId: string;
  org: string;
}) {
  const connection = useConnection(connectionId);
  const collections = useCollectionBindings(connection ?? undefined);

  // Find the FILES collection
  const filesCollection = collections.find(
    (c) => c.name.toUpperCase() === "FILES",
  );

  if (!filesCollection) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <EmptyState
          image={<Folder size={48} className="text-muted-foreground" />}
          title="No Files Collection"
          description="This connection doesn't expose a Files collection"
        />
      </div>
    );
  }

  return (
    <CollectionTab
      connectionId={connectionId}
      org={org}
      activeCollection={filesCollection}
    />
  );
}

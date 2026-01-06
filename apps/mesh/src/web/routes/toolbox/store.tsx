/**
 * Toolbox Store Page
 *
 * Store page scoped to the current toolbox.
 * Shows the same store UI but in the context of adding to this toolbox.
 */

import {
  getWellKnownCommunityRegistryConnection,
  getWellKnownRegistryConnection,
} from "@/core/well-known-mcp";
import { ConnectionCreateData } from "@/tools/connection/schema";
import { CollectionHeader } from "@/web/components/collections/collection-header";
import { StoreDiscovery } from "@/web/components/store";
import { StoreRegistrySelect } from "@/web/components/store-registry-select";
import { StoreRegistryEmptyState } from "@/web/components/store/store-registry-empty-state";
import {
  useConnectionActions,
  useConnections,
} from "@/web/hooks/collections/use-connection";
import { useRegistryConnections } from "@/web/hooks/use-binding";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Loading01 } from "@untitledui/icons";
import { Suspense } from "react";

export default function ToolboxStorePage() {
  const { org } = useProjectContext();
  const allConnections = useConnections();
  const connectionActions = useConnectionActions();

  // Filter to only show registry connections (those with collections)
  const registryConnections = useRegistryConnections(allConnections);

  const registryOptions = registryConnections.map((c) => ({
    id: c.id,
    name: c.title,
    icon: c.icon || undefined,
  }));

  // Persist selected registry in localStorage (scoped by org)
  const [selectedRegistryId, setSelectedRegistryId] = useLocalStorage<string>(
    LOCALSTORAGE_KEYS.selectedRegistry(org.slug),
    () => "",
  );

  const selectedRegistry = registryConnections.find(
    (c) => c.id === selectedRegistryId,
  );

  // If there's only one registry, use it; otherwise use the selected one if it still exists.
  const effectiveRegistry =
    selectedRegistry?.id || registryConnections[0]?.id || "";

  // Well-known registries to show in select
  const wellKnownRegistriesForSelect = [getWellKnownRegistryConnection(org.id)];

  // Well-known registries to show in empty state
  const wellKnownRegistriesForEmptyState = [
    getWellKnownCommunityRegistryConnection(),
  ];

  const addNewKnownRegistry = async (registry: ConnectionCreateData) => {
    const created = await connectionActions.create.mutateAsync(registry);
    setSelectedRegistryId(created.id);
  };

  // Filter out well-known registries that are already added
  const addedRegistryIds = new Set(registryConnections.map((c) => c.id));
  const availableWellKnownRegistries = wellKnownRegistriesForSelect.filter(
    (r) => r.id && !addedRegistryIds.has(r.id),
  );
  const availableWellKnownRegistriesForEmptyState =
    wellKnownRegistriesForEmptyState.filter(
      (r) => r.id && !addedRegistryIds.has(r.id),
    );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <CollectionHeader
        title="Store"
        ctaButton={
          <StoreRegistrySelect
            wellKnownRegistries={availableWellKnownRegistries}
            registries={registryOptions}
            value={effectiveRegistry}
            onValueChange={setSelectedRegistryId}
            onAddWellKnown={async (registry) => addNewKnownRegistry(registry)}
            placeholder="Select store..."
          />
        }
      />

      {registryConnections.length === 0 ? (
        <StoreRegistryEmptyState
          registries={availableWellKnownRegistriesForEmptyState}
          onConnected={(createdId) => setSelectedRegistryId(createdId)}
        />
      ) : (
        <Suspense
          fallback={
            <div className="h-full flex items-center justify-center">
              <Loading01
                size={32}
                className="animate-spin text-muted-foreground"
              />
            </div>
          }
        >
          <StoreDiscovery registryId={effectiveRegistry} />
        </Suspense>
      )}
    </div>
  );
}

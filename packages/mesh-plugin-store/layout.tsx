/**
 * Store Plugin Layout
 *
 * Layout wrapper for the Store plugin that configures PluginLayout
 * with store-specific header and empty state.
 */

import { REGISTRY_APP_BINDING } from "@decocms/bindings";
import { useConnectionActions, useProjectContext } from "@decocms/mesh-sdk";
// Import PluginLayout from mesh app (monorepo relative import)
import { PluginLayout } from "../../apps/mesh/src/web/layouts/plugin-layout";
import { CollectionHeader } from "./components/collection-header";
import { StoreRegistrySelect } from "./components/store-registry-select";
import { StoreRegistryEmptyState } from "./components/store-registry-empty-state";
import {
  getWellKnownCommunityRegistryConnection,
  getWellKnownRegistryConnection,
} from "./lib/well-known-registries";

/**
 * Store plugin layout component.
 * Wraps PluginLayout with store-specific configuration.
 */
export default function StorePluginLayout() {
  const { org } = useProjectContext();
  const connectionActions = useConnectionActions();

  // Well-known registries
  const wellKnownRegistries = [getWellKnownRegistryConnection(org.id)];
  const wellKnownRegistriesForEmptyState = [
    getWellKnownCommunityRegistryConnection(),
  ];

  return (
    <PluginLayout
      binding={REGISTRY_APP_BINDING}
      renderHeader={({
        connections,
        selectedConnectionId,
        onConnectionChange,
      }) => {
        const registryOptions = connections.map((c) => ({
          id: c.id,
          name: c.title,
          icon: c.icon || undefined,
        }));

        // Filter out well-known registries that are already added
        const addedRegistryIds = new Set(connections.map((c) => c.id));
        const availableWellKnownRegistries = wellKnownRegistries.filter(
          (r) => r.id && !addedRegistryIds.has(r.id),
        );

        const handleAddWellKnown = async (
          registry: Parameters<typeof connectionActions.create.mutateAsync>[0],
        ) => {
          const created = await connectionActions.create.mutateAsync(registry);
          onConnectionChange(created.id);
        };

        return (
          <CollectionHeader
            title="Store"
            ctaButton={
              <StoreRegistrySelect
                wellKnownRegistries={availableWellKnownRegistries}
                registries={registryOptions}
                value={selectedConnectionId}
                onValueChange={onConnectionChange}
                onAddWellKnown={handleAddWellKnown}
                placeholder="Select store..."
              />
            }
          />
        );
      }}
      renderEmptyState={() => {
        return (
          <div className="flex flex-col items-center justify-center h-full">
            <StoreRegistryEmptyState
              registries={wellKnownRegistriesForEmptyState}
              onConnected={() => {
                // Registry will be auto-selected by PluginLayout
              }}
            />
          </div>
        );
      }}
    />
  );
}

import {
  getWellKnownCommunityRegistryConnection,
  getWellKnownRegistryConnection,
} from "@/core/well-known-mcp";
import { CollectionHeader } from "@/web/components/collections/collection-header";
import { SelectMCPsModal } from "@/web/components/select-mcp-modal";
import { StoreDiscovery } from "@/web/components/store";
import { StoreRegistrySelect } from "@/web/components/store-registry-select";
import { StoreRegistryEmptyState } from "@/web/components/store/store-registry-empty-state";
import { useConnections, useConnectionActions } from "@/web/hooks/collections/use-connection";
import { useRegistryConnections } from "@/web/hooks/use-binding";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Icon } from "@deco/ui/components/icon.js";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { toast } from "sonner";

export default function StorePage() {
  const [isSelectMcpModalOpen, setIsSelectMcpModalOpen] = useState(false);
  const { org } = useProjectContext();
  const allConnections = useConnections();
  const connectionActions = useConnectionActions();

  // Check if we're viewing a child route (app detail)
  const routerState = useRouterState();
  const isViewingAppDetail =
    routerState.location.pathname.includes("/store/") &&
    routerState.location.pathname.split("/").length > 3;

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
  // If not found, that's fine: the connection may have been deleted/changed.
  const effectiveRegistry =
    selectedRegistry?.id || registryConnections[0]?.id || "";

  const handleAddNewRegistry = () => {
    setIsSelectMcpModalOpen(!isSelectMcpModalOpen);
  };

  // Well-known registries to show in empty state
  const wellKnownRegistries = [
    getWellKnownRegistryConnection(),
    getWellKnownCommunityRegistryConnection(),
  ];

  const confirmRegistrySelection = async (selectedIds: string[]) => {
    if (selectedIds.length === 0) {
      setIsSelectMcpModalOpen(false);
      return;
    }

    // Find which registries need to be created (not already in connections)
    const existingRegistryIds = new Set(registryConnections.map((c) => c.id));
    const registriesToCreate = wellKnownRegistries.filter(
      (registry) => registry.id && selectedIds.includes(registry.id) && !existingRegistryIds.has(registry.id),
    );

    // Create connections for registries that don't exist yet
    const createdIds: string[] = [];
    for (const registry of registriesToCreate) {
      try {
        const created = await connectionActions.create.mutateAsync(registry);
        createdIds.push(created.id);
      } catch (error) {
        console.error(`Failed to create registry ${registry.id}:`, error);
        toast.error(`Failed to create registry ${registry.title}: ${error instanceof Error ? error.message : String(error)}`);
        // Continue with other registries even if one fails
      }
    }

    // Select the first successfully created registry, or the first selected ID if it already existed
    const firstCreatedId = createdIds[0];
    const firstSelectedId = selectedIds.find((id) => existingRegistryIds.has(id)) || selectedIds[0];
    const registryToSelect = firstCreatedId || firstSelectedId;

    if (registryToSelect) {
      setSelectedRegistryId(registryToSelect);
    }

    setIsSelectMcpModalOpen(false);
  };

  // If we're viewing an app detail (child route), render the Outlet
  if (isViewingAppDetail) {
    return <Outlet />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <CollectionHeader
        title="Store"
        ctaButton={
            <StoreRegistrySelect
              registries={registryOptions}
              value={effectiveRegistry}
              onValueChange={setSelectedRegistryId}
              onAddNew={handleAddNewRegistry}
              placeholder="Select store..."
            />
        }
      />

      {/* Content Section */}
      <div className="h-full flex flex-col overflow-hidden">
        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center h-full">
              <Icon
                name="progress_activity"
                size={32}
                className="animate-spin text-muted-foreground mb-4"
              />
              <p className="text-sm text-muted-foreground">
                Loading store items...
              </p>
            </div>
          }
        >
          {effectiveRegistry ? (
            <StoreDiscovery registryId={effectiveRegistry} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              <StoreRegistryEmptyState
                registries={wellKnownRegistries}
                onConnected={(createdRegistryId) => {
                  // Auto-select the newly created registry
                  setSelectedRegistryId(createdRegistryId);
                }}
              />
            </div>
          )}
        </Suspense>
      </div>
      <SelectMCPsModal
        open={isSelectMcpModalOpen}
        onOpenChange={setIsSelectMcpModalOpen}
        connections={wellKnownRegistries.map((r) => ({
          id: r.id!,
          title: r.title,
          description: r.description,
          icon: r.icon,
        }))}
        onConfirm={confirmRegistrySelection}
      />
    </div>
  );
}

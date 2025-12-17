import {
  getWellKnownCommunityRegistryConnection,
  getWellKnownRegistryConnection,
} from "@/core/well-known-mcp";
import { CollectionHeader } from "@/web/components/collections/collection-header";
import { StoreDiscovery } from "@/web/components/store";
import { StoreRegistrySelect } from "@/web/components/store-registry-select";
import { StoreRegistryEmptyState } from "@/web/components/store/store-registry-empty-state";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useRegistryConnections } from "@/web/hooks/use-binding";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Icon } from "@deco/ui/components/icon.js";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Suspense } from "react";

export default function StorePage() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const allConnections = useConnections();

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

  // Only show selector when there are multiple registries
  const showRegistrySelector = registryConnections.length > 1;

  const handleAddNewRegistry = () => {
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
      search: { action: "create" },
    });
  };

  // Well-known registries to show in empty state
  const wellKnownRegistries = [
    getWellKnownRegistryConnection(),
    getWellKnownCommunityRegistryConnection(),
  ];

  // If we're viewing an app detail (child route), render the Outlet
  if (isViewingAppDetail) {
    return <Outlet />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <CollectionHeader
        title="Store"
        ctaButton={
          showRegistrySelector ? (
            <StoreRegistrySelect
              registries={registryOptions}
              value={effectiveRegistry}
              onValueChange={setSelectedRegistryId}
              onAddNew={handleAddNewRegistry}
              placeholder="Select store..."
            />
          ) : undefined
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
    </div>
  );
}

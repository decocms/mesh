import { StoreRegistrySelect } from "@/web/components/store-registry-select";
import { EmptyState } from "@/web/components/empty-state";
import { StoreDiscovery } from "@/web/components/store";
import { useConnections } from "@/web/hooks/collections/use-connection";
import { useRegistryConnections } from "@/web/hooks/use-binding";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { useNavigate, Outlet, useRouterState } from "@tanstack/react-router";
import { CollectionHeader } from "@/web/components/collections/collection-header";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";

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
  // If the saved registry is no longer available, fallback to first available
  const [selectedRegistry, setSelectedRegistry] = useLocalStorage<string>(
    LOCALSTORAGE_KEYS.selectedRegistry(org.slug),
    (existing) => {
      // If connections haven't loaded yet, preserve existing value
      if (registryConnections.length === 0) {
        return existing || "";
      }

      // Validate existing value against current registry connections
      if (existing) {
        const savedRegistryExists = registryConnections.some(
          (c) => c.id === existing,
        );
        if (savedRegistryExists) {
          return existing;
        }
      }
      // Fallback to first available registry
      return registryConnections[0]?.id || "";
    },
  );

  const effectiveRegistry =
    selectedRegistry || registryConnections[0]?.id || "";

  const handleAddNewRegistry = () => {
    navigate({
      to: "/$org/mcps",
      params: { org: org.slug },
      search: { action: "create" },
    });
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
            onValueChange={setSelectedRegistry}
            onAddNew={handleAddNewRegistry}
            placeholder="Select store..."
          />
        }
      />

      {/* Content Section */}
      <div className="h-full flex flex-col overflow-hidden">
        {effectiveRegistry ? (
          <StoreDiscovery registryId={effectiveRegistry} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            <EmptyState
              image={
                <img
                  src="/store-empty-state.svg"
                  alt="No store connected"
                  width={423}
                  height={279}
                  className="max-w-full h-auto"
                />
              }
              title="No store connected"
              description="Connect to a store to discover and install MCPs from the community."
              actions={
                <StoreRegistrySelect
                  registries={registryOptions}
                  value={effectiveRegistry}
                  onValueChange={setSelectedRegistry}
                  onAddNew={handleAddNewRegistry}
                  placeholder="Select store..."
                />
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

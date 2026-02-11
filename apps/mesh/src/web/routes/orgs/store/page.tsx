import { Page } from "@/web/components/page";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@deco/ui/components/breadcrumb.tsx";
import { StoreDiscovery } from "@/web/components/store";
import { StoreRegistrySelect } from "@/web/components/store/store-registry-select";
import { StoreRegistryEmptyState } from "@/web/components/store/store-registry-empty-state";
import { useRegistryConnections } from "@/web/hooks/use-binding";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import { KEYS } from "@/web/lib/query-keys";
import {
  SELF_MCP_ALIAS_ID,
  getWellKnownCommunityRegistryConnection,
  getWellKnownRegistryConnection,
  useMCPClient,
  useConnectionActions,
  useConnections,
  useProjectContext,
  type ConnectionCreateData,
} from "@decocms/mesh-sdk";
import { useQuery } from "@tanstack/react-query";
import { Loading01 } from "@untitledui/icons";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { Suspense } from "react";

interface PluginConfigResponse {
  config: {
    settings: Record<string, unknown> | null;
  } | null;
}

function usePrivateRegistryDisplayConfig() {
  const { org, project } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const query = useQuery({
    queryKey: KEYS.projectPluginConfig(project.id ?? "", "private-registry"),
    queryFn: async () => {
      const response = (await client.callTool({
        name: "PROJECT_PLUGIN_CONFIG_GET",
        arguments: {
          projectId: project.id,
          pluginId: "private-registry",
        },
      })) as unknown as {
        structuredContent?: PluginConfigResponse;
      } & PluginConfigResponse;
      return (response.structuredContent ?? response) as PluginConfigResponse;
    },
    enabled: Boolean(project.id),
    staleTime: 10_000,
  });

  const settings = query.data?.config?.settings as Record<
    string,
    unknown
  > | null;

  return {
    registryName: (settings?.registryName as string | undefined) ?? undefined,
    registryIcon: (settings?.registryIcon as string | undefined) ?? undefined,
  };
}

export default function StorePage() {
  const { org } = useProjectContext();
  const allConnections = useConnections();
  const connectionActions = useConnectionActions();
  const {
    registryName: privateRegistryName,
    registryIcon: privateRegistryIcon,
  } = usePrivateRegistryDisplayConfig();

  // Check if we're viewing a child route (server detail)
  const routerState = useRouterState();
  const isViewingServerDetail =
    routerState.location.pathname.includes("/store/") &&
    routerState.location.pathname.split("/").length > 3;

  // Filter to only show registry connections (those with collections)
  const registryConnections = useRegistryConnections(allConnections);
  const isPrivateRegistryConnection = (connection: {
    id: string;
    metadata?: unknown;
    tools?: Array<{ name: string }> | null;
  }) => {
    const metadata = connection.metadata as Record<string, unknown> | null;
    return (
      metadata?.type === "self" &&
      (connection.tools?.some(
        (tool) => tool.name === "COLLECTION_REGISTRY_APP_LIST",
      ) ??
        false)
    );
  };

  // Keep private registry first to avoid defaulting to external registries.
  const registryConnectionsSorted = [...registryConnections].sort((a, b) => {
    const aPrivate = isPrivateRegistryConnection(a) ? 1 : 0;
    const bPrivate = isPrivateRegistryConnection(b) ? 1 : 0;
    return bPrivate - aPrivate;
  });

  const registryOptions = registryConnectionsSorted.map((c) => {
    const metadata = c.metadata as Record<string, unknown> | null | undefined;
    const connectionType = metadata?.type;
    const hasRegistryListTool =
      c.tools?.some((tool) => tool.name === "COLLECTION_REGISTRY_APP_LIST") ??
      false;

    // The self connection powers org private registry, but "Mesh MCP" is confusing in Store selector.
    const displayName =
      connectionType === "self" && hasRegistryListTool
        ? (privateRegistryName ?? "Private Registry")
        : c.title;

    return {
      id: c.id,
      name: displayName,
      icon:
        connectionType === "self" && hasRegistryListTool
          ? (privateRegistryIcon ?? c.icon ?? undefined)
          : (c.icon ?? undefined),
    };
  });

  // Persist selected registry in localStorage (scoped by org)
  const [selectedRegistryId, setSelectedRegistryId] = useLocalStorage<string>(
    LOCALSTORAGE_KEYS.selectedRegistry(org.slug),
    (existing) => existing ?? "",
  );

  const selectedRegistry = registryConnectionsSorted.find(
    (c) => c.id === selectedRegistryId,
  );
  const privateRegistryConnection = registryConnectionsSorted.find(
    (connection) => isPrivateRegistryConnection(connection),
  );

  // If there's only one registry, use it; otherwise use the selected one if it still exists.
  // If not found, that's fine: the connection may have been deleted/changed.
  const effectiveRegistry =
    selectedRegistry?.id ||
    privateRegistryConnection?.id ||
    registryConnectionsSorted[0]?.id ||
    "";

  // Well-known registries to show in select (hidden/less prominent)
  const wellKnownRegistriesForSelect = [getWellKnownRegistryConnection(org.id)];

  // Well-known registries to show in empty state (only Community Registry)
  const wellKnownRegistriesForEmptyState = [
    getWellKnownCommunityRegistryConnection(),
  ];

  const addNewKnownRegistry = async (registry: ConnectionCreateData) => {
    const created = await connectionActions.create.mutateAsync(registry);
    setSelectedRegistryId(created.id);
  };

  // Filter out well-known registries that are already added
  const addedRegistryIds = new Set(registryConnectionsSorted.map((c) => c.id));
  const availableWellKnownRegistries = wellKnownRegistriesForSelect.filter(
    (r) => r.id && !addedRegistryIds.has(r.id),
  );
  const availableWellKnownRegistriesForEmptyState =
    wellKnownRegistriesForEmptyState.filter(
      (r) => r.id && !addedRegistryIds.has(r.id),
    );

  // If we're viewing a server detail (child route), render the Outlet
  if (isViewingServerDetail) {
    return <Outlet />;
  }

  return (
    <Page>
      <Page.Header>
        <Page.Header.Left>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Store</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Page.Header.Left>
        <Page.Header.Right>
          <StoreRegistrySelect
            wellKnownRegistries={availableWellKnownRegistries}
            registries={registryOptions}
            value={effectiveRegistry}
            onValueChange={setSelectedRegistryId}
            onAddWellKnown={async (registry) => addNewKnownRegistry(registry)}
            placeholder="Select store..."
          />
        </Page.Header.Right>
      </Page.Header>

      {/* Content Section */}
      <Page.Content>
        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center h-full">
              <Loading01
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
                registries={availableWellKnownRegistriesForEmptyState}
                onConnected={(createdRegistryId) => {
                  // Auto-select the newly created registry
                  setSelectedRegistryId(createdRegistryId);
                }}
              />
            </div>
          )}
        </Suspense>
      </Page.Content>
    </Page>
  );
}

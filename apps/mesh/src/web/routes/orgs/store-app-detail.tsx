import type { RegistryItem } from "@/web/components/store/registry-items-section";
import {
  AppDetailLoadingState,
  AppDetailErrorState,
  AppDetailNotFoundState,
  AppDetailHeader,
  AppHeroSection,
  AppSidebar,
  AppTabsContent,
  type AppData,
  type PublisherInfo,
} from "@/web/components/store/app-detail";
import {
  useConnection,
  useConnections,
  useConnectionsCollection,
  type ConnectionEntity,
} from "@/web/hooks/collections/use-connection";
import { useRegistryConnections } from "@/web/hooks/use-binding";
import { usePublisherConnection } from "@/web/hooks/use-publisher-connection";
import { useToolCall } from "@/web/hooks/use-tool-call";
import { useMcp } from "use-mcp/react";
import { authClient } from "@/web/lib/auth-client";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { extractConnectionData } from "@/web/utils/extract-connection-data";
import { slugify } from "@/web/utils/slugify";
import { getGitHubAvatarUrl, extractGitHubRepo } from "@/web/utils/github-icon";
import {
  findListToolName,
  getConnectionTypeLabel,
  extractSchemaVersion,
} from "@/web/utils/registry-utils";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Icon } from "@deco/ui/components/icon.tsx";
import { useState } from "react";
import { toast } from "sonner";
import { createToolCaller } from "@/tools/client";

/** Get publisher info (logo and app count) from items in the store or connection in database */
function getPublisherInfo(
  items: RegistryItem[],
  publisherName: string,
  publisherConnection?: { icon: string | null } | null,
  registryConnection?: ConnectionEntity | null,
  totalCount?: number | null,
): PublisherInfo {
  if (!publisherName || publisherName === "Unknown") {
    return { count: 0 };
  }

  // For official registry, use registry connection icon and totalCount from API
  if (publisherName === "io.modelcontextprotocol.registry/official") {
    const icon = registryConnection?.icon;
    return {
      logo: icon || undefined,
      count: totalCount ?? items.length,
    };
  }

  const publisherLower = publisherName.toLowerCase();
  const matchingItems = items.filter((item) => {
    const officialMeta =
      item._meta?.["io.modelcontextprotocol.registry/official"];
    const itemPublisher = officialMeta
      ? "io.modelcontextprotocol.registry/official"
      : item.publisher || item._meta?.["mcp.mesh"]?.scopeName || "Unknown";
    return itemPublisher.toLowerCase() === publisherLower;
  });

  // Priority: connection icon > store publisher_logo > store icon
  const logo =
    publisherConnection?.icon ||
    matchingItems[0]?.publisher_logo ||
    matchingItems[0]?.icon ||
    undefined;

  return {
    logo,
    count: matchingItems.length,
  };
}

/** Helper to extract data from different JSON structures */
function extractItemData(item: RegistryItem): AppData {
  const publisherMeta = item.server?._meta?.["mcp.mesh/publisher-provided"];
  const decoMeta = item._meta?.["mcp.mesh"];
  const officialMeta =
    item._meta?.["io.modelcontextprotocol.registry/official"];
  const server = item.server;

  // Extract connection type from remotes
  const connectionType = getConnectionTypeLabel(server?.remotes?.[0]?.type);

  // Extract schema version from $schema URL
  const schemaVersion = extractSchemaVersion(server?.$schema);

  // Extract publisher - prioritize official registry meta
  const publisher = officialMeta
    ? "io.modelcontextprotocol.registry/official"
    : item.publisher || decoMeta?.scopeName || "Unknown";

  // Get icon with GitHub fallback
  const githubIcon = getGitHubAvatarUrl(server?.repository);

  const icon =
    item.icon ||
    item.image ||
    item.logo ||
    item.server?.icons?.[0]?.src ||
    githubIcon ||
    null;

  return {
    name: item.name || item.title || item.server?.title || "Unnamed Item",
    description:
      item.description || item.summary || item.server?.description || "",
    icon: icon,
    verified: item.verified || decoMeta?.verified,
    publisher: publisher,
    version: server?.version || null,
    websiteUrl: server?.websiteUrl || null,
    repository: server?.repository || null,
    schemaVersion: schemaVersion ?? null,
    connectionType: connectionType,
    connectionUrl: null,
    remoteUrl: null,
    tools: item.tools || item.server?.tools || publisherMeta?.tools || [],
    models: item.models || item.server?.models || publisherMeta?.models || [],
    emails: item.emails || item.server?.emails || publisherMeta?.emails || [],
    analytics:
      item.analytics || item.server?.analytics || publisherMeta?.analytics,
    cdn: item.cdn || item.server?.cdn || publisherMeta?.cdn,
  };
}

export default function StoreAppDetail() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  // Get appName from the child route (just /$appName)
  const { appName } = useParams({ strict: false }) as { appName?: string };
  const {
    registryId: registryIdParam,
    serverName,
    itemId,
  } = useSearch({
    strict: false,
  }) as {
    registryId?: string;
    serverName?: string;
    itemId?: string;
  };

  // Track active tab - initially "readme"
  const [activeTabId, setActiveTabId] = useState<string>("readme");
  const [isInstalling, setIsInstalling] = useState(false);

  const connectionsCollection = useConnectionsCollection();
  const allConnections = useConnections();
  const { data: session } = authClient.useSession();
  const registryConnections = useRegistryConnections(allConnections);

  // Use passed registryId or default to first one
  const effectiveRegistryId =
    registryIdParam || registryConnections[0]?.id || "";

  const registryConnection = useConnection(effectiveRegistryId);

  // Find the LIST tool from the registry connection
  const listToolName = findListToolName(registryConnection?.tools);

  const versionsToolName = !registryConnection?.tools
    ? ""
    : (() => {
        const versionsTool = registryConnection.tools.find((tool) =>
          tool.name.endsWith("_VERSIONS"),
        );
        return versionsTool?.name || "";
      })();

  const getToolName = !registryConnection?.tools
    ? ""
    : (() => {
        const getTool = registryConnection.tools.find((tool) =>
          tool.name.endsWith("_GET"),
        );
        return getTool?.name || "";
      })();

  const toolCaller = createToolCaller(effectiveRegistryId);

  // If serverName provided, use versions tool (or get as fallback); otherwise use list tool
  const shouldUseVersionsTool = !!serverName;
  let toolName = "";
  let toolInputParams: Record<string, unknown> = {};

  if (shouldUseVersionsTool) {
    // Try VERSIONS first, fallback to GET
    toolName = versionsToolName || getToolName;
    // Different registries accept different parameters:
    // - Official registry: requires 'name' parameter
    // - Deco registry: requires 'id' parameter
    // Send both to support all registry types - each will use what it needs
    toolInputParams = {
      name: serverName,
      id: itemId || serverName,
    };
  } else {
    // Use LIST tool
    toolName = listToolName;
    toolInputParams = {};
  }

  const {
    data: listResults,
    isLoading,
    error,
  } = useToolCall({
    toolCaller,
    toolName: toolName,
    toolInputParams: toolInputParams,
    connectionId: effectiveRegistryId,
    enabled: !!toolName && !!effectiveRegistryId,
  });

  // Extract items and totalCount from results
  let items: RegistryItem[] = [];
  let allVersions: RegistryItem[] = []; // Store all versions for dropdown
  let totalCount: number | null = null;

  if (listResults) {
    if (Array.isArray(listResults)) {
      items = listResults;
    } else if (typeof listResults === "object" && listResults !== null) {
      // Check for totalCount in the response
      if (
        "totalCount" in listResults &&
        typeof listResults.totalCount === "number"
      ) {
        totalCount = listResults.totalCount;
      }

      // Handle Deco format: { item: { server: {...} } }
      // Convert to standard RegistryItem format
      if ("item" in listResults && listResults.item) {
        const itemWrapper = listResults.item as {
          id?: string;
          title?: string;
          server?: unknown;
          _meta?: unknown;
        };
        items = [
          {
            id: itemWrapper.id || "",
            title: itemWrapper.title,
            server: itemWrapper.server as RegistryItem["server"],
            _meta: itemWrapper._meta as RegistryItem["_meta"],
          },
        ];
      } else {
        // Find the items array - supports "versions", "servers", "items" keys
        let itemsKey: string | undefined;
        if ("versions" in listResults && Array.isArray(listResults.versions)) {
          itemsKey = "versions";
        } else if (
          "servers" in listResults &&
          Array.isArray(listResults.servers)
        ) {
          itemsKey = "servers";
        } else {
          itemsKey = Object.keys(listResults).find((key) =>
            Array.isArray(listResults[key as keyof typeof listResults]),
          );
        }

        if (itemsKey) {
          items = listResults[
            itemsKey as keyof typeof listResults
          ] as RegistryItem[];
          // If VERSIONS tool, store all versions for dropdown
          if (itemsKey === "versions" || toolName?.includes("VERSIONS")) {
            allVersions = items;
          }
        }
      }
    }
  }

  // Find the item matching the appName slug or serverName
  let selectedItem = items.find((item) => {
    const itemName = item.name || item.title || item.server?.title || "";
    return slugify(itemName) === appName;
  });

  // If not found in list but serverName provided, try to find by server name
  if (!selectedItem && serverName) {
    selectedItem = items.find((item) => {
      const serverNameMatch =
        item.server?.name === serverName ||
        item.name === serverName ||
        item.title === serverName;
      return serverNameMatch;
    });
  }

  // Extract data from item
  const data = selectedItem ? extractItemData(selectedItem) : null;

  // Check if we have local tools and get remote URL
  const hasLocalTools = (data?.tools?.length || 0) > 0;
  const remoteUrl = selectedItem?.server?.remotes?.[0]?.url || null;
  const shouldFetchRemote = !hasLocalTools && !!remoteUrl;

  // Fetch tools from remote MCP server if no local tools are available
  const remoteMcp = useMcp({
    url: shouldFetchRemote ? remoteUrl : "",
    clientName: "MCP Store Preview",
    clientUri: typeof window !== "undefined" ? window.location.origin : "",
    autoReconnect: false,
    autoRetry: false,
  });

  const isLoadingRemoteTools =
    shouldFetchRemote &&
    (remoteMcp.state === "connecting" ||
      remoteMcp.state === "authenticating" ||
      remoteMcp.state === "pending_auth");

  const remoteTools =
    shouldFetchRemote && remoteMcp.state === "ready"
      ? (remoteMcp.tools || []).map((t) => ({
          name: t.name,
          description: t.description,
        }))
      : [];

  // Combine local and remote tools - prefer local if available
  const effectiveTools = hasLocalTools ? data?.tools || [] : remoteTools;

  // Get publisher connection from database
  const publisherConnection = usePublisherConnection(
    allConnections,
    data?.publisher,
  );

  // Calculate publisher info
  const publisherInfo: PublisherInfo = !data
    ? { count: 0 }
    : getPublisherInfo(
        items,
        data.publisher,
        publisherConnection,
        registryConnection ?? null,
        totalCount,
      );

  // Check if repository is available for README tab
  const repo = data?.repository ? extractGitHubRepo(data.repository) : null;

  const availableTabs = [
    {
      id: "readme",
      label: "README",
      visible: !!data?.repository && !!repo,
    },
    {
      id: "tools",
      label: "Tools",
      count: effectiveTools.length,
      visible:
        hasLocalTools ||
        remoteTools.length > 0 ||
        (isLoadingRemoteTools && !!remoteUrl),
    },
  ].filter((tab) => tab.visible);

  // Calculate effective active tab - prioritize README, then tools, otherwise first available
  const effectiveActiveTabId = availableTabs.find((t) => t.id === activeTabId)
    ? activeTabId
    : availableTabs.find((t) => t.id === "readme")?.id ||
      availableTabs[0]?.id ||
      "overview";

  const handleInstall = async (versionIndex?: number) => {
    const version = allVersions[versionIndex ?? 0] || selectedItem;
    if (!version || !org || !session?.user?.id) return;

    const connectionData = extractConnectionData(
      version,
      org.id,
      session.user.id,
    );

    if (!connectionData.connection_url) {
      toast.error("This app cannot be installed: no connection URL available");
      return;
    }

    // Build title with version and LATEST badge
    const versionNumber = version.server?.version;
    const isLatest = (
      version._meta?.["io.modelcontextprotocol.registry/official"] as any
    )?.isLatest;
    const titleWithVersion = versionNumber
      ? `${connectionData.title} v${versionNumber}${isLatest ? " (LATEST)" : ""}`
      : connectionData.title;

    setIsInstalling(true);
    try {
      const tx = connectionsCollection.insert(connectionData);
      await tx.isPersisted.promise;

      toast.success(`${titleWithVersion} installed successfully`);

      // Use the deterministic ID to directly look up the connection
      const newConnection = connectionsCollection.get(connectionData.id);

      if (newConnection?.id && org) {
        navigate({
          to: "/$org/mcps/$connectionId",
          params: { org: org.slug, connectionId: newConnection.id },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to install app: ${message}`);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleBackClick = () => {
    navigate({
      to: "/$org/store",
      params: { org: org.slug },
    });
  };

  // Loading state
  if (isLoading) {
    return <AppDetailLoadingState />;
  }

  // Error state
  if (error) {
    return <AppDetailErrorState error={error} onBack={handleBackClick} />;
  }

  // Not found state
  if (!selectedItem) {
    return <AppDetailNotFoundState onBack={handleBackClick} />;
  }

  if (!data) {
    return null;
  }

  // Check if app can be installed (must have remotes)
  const canInstall = (selectedItem?.server?.remotes?.length ?? 0) > 0;

  return (
    <div className="flex flex-col h-full border-l border-border">
      {/* Header */}
      <AppDetailHeader onBack={handleBackClick} />

      {/* Content */}
      <div className="flex-1 overflow-y-auto pt-10 h-full">
        <div className="h-full">
          <div className="max-w-7xl mx-auto h-full">
            {/* Not installable state */}
            {!canInstall && (
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
                <Icon name="info" size={16} className="inline mr-2" />
                This app cannot be installed - no installation method available.
              </div>
            )}

            {/* SECTION 1: Hero (Full Width) */}
            <AppHeroSection
              data={data}
              itemVersions={
                allVersions.length > 0 ? allVersions : [selectedItem]
              }
              isInstalling={isInstalling}
              onInstall={handleInstall}
              canInstall={canInstall}
            />

            {/* SECTION 2 & 3: Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 min-h-[677px]">
              {/* SECTION 2: Left Column (Overview + Publisher) */}
              <AppSidebar
                data={data}
                publisherInfo={publisherInfo}
                selectedItem={selectedItem}
              />

              {/* SECTION 3: Right Column (Tabs + Content) */}
              <AppTabsContent
                data={data}
                availableTabs={availableTabs}
                effectiveActiveTabId={effectiveActiveTabId}
                effectiveTools={effectiveTools}
                isLoadingTools={isLoadingRemoteTools}
                onTabChange={setActiveTabId}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

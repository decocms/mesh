/**
 * MCP Server Detail Page
 *
 * Shows detailed information about an MCP server from the registry,
 * including README, tools, and installation options.
 */

import type { RegistryItem } from "../types";
import {
  MCPServerDetailLoadingState,
  MCPServerDetailErrorState,
  MCPServerDetailNotFoundState,
  MCPServerDetailHeader,
  MCPServerHeroSection,
  MCPServerDetailSidebar,
  MCPServerTabsContent,
  type MCPServerData,
  type PublisherInfo,
} from "../components/mcp-server-detail";
// Import from mesh-sdk
import {
  useConnection,
  useConnections,
  useConnectionActions,
  useToolCall,
  useMcp,
  useProjectContext,
  createToolCaller,
  type ConnectionEntity,
} from "@decocms/mesh-sdk";
import { usePublisherConnection } from "../hooks/use-publisher-connection";
import { extractConnectionData } from "../lib/extract-connection-data";
// Local utilities
import {
  slugify,
  getGitHubAvatarUrl,
  extractGitHubRepo,
  findListToolName,
  getConnectionTypeLabel,
  extractSchemaVersion,
  extractDisplayNameFromDomain,
} from "../lib/utils";
import { InfoCircle } from "@untitledui/icons";
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  Suspense,
  useState,
} from "react";
import { toast } from "sonner";
import { storeRouter } from "../index";
import { usePluginContext } from "@decocms/bindings";
import { REGISTRY_APP_BINDING } from "@decocms/bindings";

/** Get publisher info (logo and server count) from items in the store or connection in database */
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
function extractItemData(item: RegistryItem): MCPServerData {
  const decoMeta = item._meta?.["mcp.mesh"];
  const officialMeta =
    item._meta?.["io.modelcontextprotocol.registry/official"];
  const server = item.server;

  // Extract connection type from remotes
  const connectionType = getConnectionTypeLabel(server.remotes?.[0]?.type);

  // Extract schema version from $schema URL
  const schemaVersion = extractSchemaVersion(server.$schema);

  // Extract publisher - prioritize official registry meta
  const publisher = officialMeta
    ? "io.modelcontextprotocol.registry/official"
    : item.publisher || decoMeta?.scopeName || "Unknown";

  // Get icon with GitHub fallback
  const githubIcon = getGitHubAvatarUrl(server.repository);

  const icon =
    item.icon ||
    item.image ||
    item.logo ||
    server.icons?.[0]?.src ||
    githubIcon ||
    null;

  // Extract raw name and apply display name formatting
  const rawName =
    item.name || item.title || item.server?.title || "Unnamed Item";
  const displayName = extractDisplayNameFromDomain(rawName);

  // PRIORITY: Use friendly_name if available
  const finalName = decoMeta?.friendly_name || displayName;

  // Description priority: mesh_description > server.description
  const description =
    decoMeta?.mesh_description ||
    item.description ||
    item.summary ||
    server?.description ||
    "";

  // Extract short_description
  const shortDescription = decoMeta?.short_description || null;

  // Extract tags and categories
  const tags = decoMeta?.tags || [];
  const categories = decoMeta?.categories || [];

  return {
    name: finalName,
    description: description,
    shortDescription: shortDescription,
    icon: icon,
    verified: item.verified || decoMeta?.verified,
    publisher: publisher,
    version: server.version || null,
    websiteUrl: server.websiteUrl || null,
    repository: server.repository || null,
    schemaVersion: schemaVersion ?? null,
    connectionType: connectionType,
    connectionUrl: null,
    remoteUrl: null,
    tags: tags,
    categories: categories,
    tools: item.tools || server.tools || decoMeta?.tools || [],
    models: item.models || server.models || decoMeta?.models || [],
    emails: item.emails || server.emails || decoMeta?.emails || [],
    analytics: item.analytics || server.analytics || decoMeta?.analytics,
    cdn: item.cdn || server.cdn || decoMeta?.cdn,
  };
}

/**
 * Error boundary for store MCP server detail
 */
class StoreMCPServerDetailErrorBoundary extends Component<
  { children: ReactNode; onBack: () => void },
  { hasError: boolean; error: Error | null }
> {
  override state = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Store MCP server detail error:", error, errorInfo);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <MCPServerDetailErrorState
          error={this.state.error || new Error("Unknown error")}
          onBack={this.props.onBack}
        />
      );
    }

    return this.props.children;
  }
}

function StoreMCPServerDetailContent() {
  const { org } = useProjectContext();
  const navigate = storeRouter.useNavigate();
  // Get serverSlug from the child route
  const { appName: serverSlug } = storeRouter.useParams({ from: "/$appName" });
  const { registryId: registryIdParam, serverName } = storeRouter.useSearch({
    from: "/$appName",
  });

  // Get connection and session from plugin context
  // Connection is guaranteed by layout (routes only render when connection exists)
  const { connectionId: pluginConnectionId, session } =
    usePluginContext<typeof REGISTRY_APP_BINDING>();

  // Track active tab - initially "readme"
  const [activeTabId, setActiveTabId] = useState<string>("readme");

  const actions = useConnectionActions();
  const allConnections = useConnections();

  // Use passed registryId or plugin context connection (always set by layout)
  const effectiveRegistryId = registryIdParam || pluginConnectionId;

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
    toolInputParams = {
      name: serverName,
    };
  } else {
    // Use LIST tool
    toolName = listToolName;
    toolInputParams = {};
  }

  const { data: listResults } = useToolCall({
    toolCaller,
    toolName: toolName,
    toolInputParams: toolInputParams,
    scope: effectiveRegistryId,
  });

  // Extract items and totalCount from results
  let items: RegistryItem[] = [];
  let allVersions: RegistryItem[] = [];
  let totalCount: number | null = null;

  if (listResults) {
    if (Array.isArray(listResults)) {
      items = listResults;
    } else if (typeof listResults === "object" && listResults !== null) {
      if (
        "totalCount" in listResults &&
        typeof listResults.totalCount === "number"
      ) {
        totalCount = listResults.totalCount;
      }

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
          if (itemsKey === "versions" || toolName?.includes("VERSIONS")) {
            allVersions = items;
          }
        }
      }
    }
  }

  // Find the item matching the serverSlug or serverName
  let selectedItem = items.find((item) => {
    const itemName = item.name || item.title || item.server.title || "";
    return slugify(itemName) === serverSlug;
  });

  if (!selectedItem && serverName) {
    selectedItem = items.find((item) => {
      const serverNameMatch =
        item.server.name === serverName ||
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
  });

  const isLoadingRemoteTools =
    shouldFetchRemote && remoteMcp.state === "connecting";

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

  // Calculate effective active tab
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
      toast.error(
        "This MCP Server cannot be connected: no connection URL available",
      );
      return;
    }

    try {
      const { id } = await actions.create.mutateAsync(connectionData);

      // Navigate to connection detail using mesh router (not plugin router)
      // since the connection page is outside the plugin
      window.location.href = `/${org.slug}/mcps/${id}`;
    } catch (error) {
      toast.error(
        `Failed to connect MCP Server: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const handleBackClick = () => {
    navigate({ to: "/" });
  };

  // Not found state
  if (!selectedItem) {
    return <MCPServerDetailNotFoundState onBack={handleBackClick} />;
  }

  if (!data) {
    return null;
  }

  // Check if server can be installed (must have remotes)
  const canInstall = (selectedItem?.server?.remotes?.length ?? 0) > 0;

  return (
    <div className="flex flex-col h-full border-l border-border">
      {/* Header */}
      <MCPServerDetailHeader onBack={handleBackClick} />

      {/* Content */}
      <div className="flex-1 overflow-y-auto h-full">
        <div className="h-full">
          <div className="h-full">
            {/* Not installable state */}
            {!canInstall && (
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
                <InfoCircle size={16} className="inline mr-2" />
                This MCP Server cannot be connected - no connection method
                available.
              </div>
            )}

            {/* SECTION 1: Hero (Full Width) */}
            <MCPServerHeroSection
              data={data}
              itemVersions={
                allVersions.length > 0 ? allVersions : [selectedItem]
              }
              onInstall={handleInstall}
              canInstall={canInstall}
              isInstalling={actions.create.isPending}
            />

            {/* SECTION 2 & 3: Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 min-h-[677px]">
              {/* SECTION 2: Left Column (Overview + Publisher) */}
              <MCPServerDetailSidebar
                data={data}
                publisherInfo={publisherInfo}
                selectedItem={selectedItem}
              />

              {/* SECTION 3: Right Column (Tabs + Content) */}
              <MCPServerTabsContent
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

export default function McpServerDetailPage() {
  const navigate = storeRouter.useNavigate();

  const handleBackClick = () => {
    navigate({ to: "/" });
  };

  return (
    <StoreMCPServerDetailErrorBoundary onBack={handleBackClick}>
      <Suspense fallback={<MCPServerDetailLoadingState />}>
        <StoreMCPServerDetailContent />
      </Suspense>
    </StoreMCPServerDetailErrorBoundary>
  );
}

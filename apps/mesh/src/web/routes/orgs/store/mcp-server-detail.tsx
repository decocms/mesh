import type { RegistryItem } from "@/web/components/store/types";
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
} from "@/web/components/store/mcp-server-detail";
import {
  useConnection,
  useConnections,
  useConnectionActions,
  type ConnectionEntity,
} from "@/web/hooks/collections/use-connection";
import { useRegistryConnections } from "@/web/hooks/use-binding";
import { usePublisherConnection } from "@/web/hooks/use-publisher-connection";
import { useMCPClient, useMCPToolCall } from "@decocms/mesh-sdk";
import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/web/lib/auth-client";
import { useLocalStorage } from "@/web/hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "@/web/lib/localstorage-keys";
import { KEYS } from "@/web/lib/query-keys";
import { useProjectContext } from "@decocms/mesh-sdk";
import { extractConnectionData } from "@/web/utils/extract-connection-data";
import { slugify } from "@/web/utils/slugify";
import { getGitHubAvatarUrl, extractGitHubRepo } from "@/web/utils/github-icon";
import {
  findListToolName,
  getConnectionTypeLabel,
  extractSchemaVersion,
} from "@/web/utils/registry-utils";
import { extractDisplayNameFromDomain } from "@/web/utils/server-name";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { InfoCircle } from "@untitledui/icons";
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  Suspense,
  useState,
} from "react";
import { toast } from "sonner";

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
  const navigate = useNavigate();
  // Get serverSlug from the child route
  const { appName: serverSlug } = useParams({ strict: false }) as {
    appName?: string;
  };
  const {
    registryId: registryIdParam,
    serverName,
    stdio: stdioParam,
  } = useSearch({
    strict: false,
  }) as {
    registryId: string;
    serverName: string;
    stdio?: string;
  };

  // Persist showStdio preference in localStorage, URL param overrides
  const [storedShowStdio, setStoredShowStdio] = useLocalStorage<boolean>(
    LOCALSTORAGE_KEYS.storeShowStdio(),
    () => false,
  );
  // URL param takes precedence, then localStorage
  const showStdio =
    stdioParam === "true"
      ? true
      : stdioParam === "false"
        ? false
        : storedShowStdio;
  // Update localStorage when URL param is present
  if (stdioParam !== undefined && (stdioParam === "true") !== storedShowStdio) {
    setStoredShowStdio(stdioParam === "true");
  }

  // Track active tab - no initial value, will be calculated
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  // Track selected version for installations (null means use latest)
  const [selectedVersionIndex, setSelectedVersionIndex] = useState<
    number | null
  >(null);

  const actions = useConnectionActions();
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
    };
  } else {
    // Use LIST tool
    toolName = listToolName;
    toolInputParams = {};
  }

  const registryClient = useMCPClient({
    connectionId: effectiveRegistryId || null,
    orgSlug: org.slug,
  });

  const { data: listResults } = useMCPToolCall({
    client: registryClient,
    toolName: toolName,
    toolArguments: toolInputParams,
    select: (result) =>
      (result as { structuredContent?: unknown }).structuredContent ?? result,
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

  // Find the index of the "latest" version (or default to 0)
  const latestVersionIndex = (() => {
    const latestIdx = allVersions.findIndex((v) => {
      const meta = v._meta?.["io.modelcontextprotocol.registry/official"] as
        | { isLatest?: boolean }
        | undefined;
      return meta?.isLatest === true;
    });
    return latestIdx >= 0 ? latestIdx : 0;
  })();

  // Use selected version or default to latest
  const effectiveVersionIndex = selectedVersionIndex ?? latestVersionIndex;

  // Find the item matching the serverSlug or serverName
  let selectedItem = items.find((item) => {
    const itemName = item.name || item.title || item.server.title || "";
    return slugify(itemName) === serverSlug;
  });

  // If not found in list but serverName provided, try to find by server name
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
  const remoteMcpQuery = useQuery({
    queryKey: KEYS.remoteMcpTools(remoteUrl),
    queryFn: async () => {
      if (!remoteUrl) return [];

      const { Client } = await import(
        "@modelcontextprotocol/sdk/client/index.js"
      );
      const { StreamableHTTPClientTransport } = await import(
        "@decocms/mesh-sdk"
      );

      const client = new Client({ name: "mesh-store", version: "1.0.0" });

      const transport = new StreamableHTTPClientTransport(new URL(remoteUrl), {
        requestInit: {
          headers: {
            Accept: "application/json, text/event-stream",
            "Content-Type": "application/json",
          },
        },
      });

      try {
        await client.connect(transport);
        const result = await client.listTools();
        return (result.tools || []).map((t) => ({
          name: t.name,
          description: t.description,
        }));
      } finally {
        await client.close().catch(console.error);
      }
    },
    enabled: shouldFetchRemote,
  });

  const isLoadingRemoteTools = shouldFetchRemote && remoteMcpQuery.isLoading;
  const remoteTools = remoteMcpQuery.data ?? [];

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

  // Combine remotes and packages into a unified list for display
  const remotes = selectedItem?.server?.remotes ?? [];
  const packages = selectedItem?.server?.packages ?? [];

  // Convert packages to remote-like format for unified display
  const allServers = [
    ...remotes.map((r, idx) => ({
      ...r,
      _type: "remote" as const,
      _index: idx,
    })),
    ...packages.map((pkg, idx) => ({
      type: "stdio" as const,
      url: undefined,
      name: pkg.name || pkg.identifier,
      title: pkg.name || pkg.identifier?.replace(/^@[^/]+\//, ""),
      description: pkg.environmentVariables?.length
        ? `Requires ${pkg.environmentVariables.length} environment variable(s)`
        : undefined,
      _type: "package" as const,
      _index: idx,
    })),
  ];

  // Filter servers based on showStdio preference for visibility calculation
  const visibleServers = showStdio
    ? allServers
    : allServers.filter((s) => s.type?.toLowerCase() !== "stdio");

  // Calculate if we have multiple connection options (considering showStdio filter)
  const hasMultipleServers = visibleServers.length > 1;

  const availableTabs = [
    {
      id: "servers",
      label: "Servers",
      count: visibleServers.length,
      visible: hasMultipleServers,
    },
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

  // Calculate effective active tab - prioritize servers if available, then README, then tools
  // If user has selected a tab, use that; otherwise use default priority
  const defaultTabId =
    availableTabs.find((t) => t.id === "servers")?.id ||
    availableTabs.find((t) => t.id === "readme")?.id ||
    availableTabs[0]?.id ||
    "overview";

  const effectiveActiveTabId =
    activeTabId && availableTabs.find((t) => t.id === activeTabId)
      ? activeTabId
      : defaultTabId;

  const handleInstall = async (
    versionIndex?: number,
    remoteIndex?: number,
    packageIndex?: number,
  ) => {
    const version = allVersions[versionIndex ?? 0] || selectedItem;
    if (!version || !org || !session?.user?.id) return;

    const connectionData = extractConnectionData(
      version,
      org.id,
      session.user.id,
      {
        remoteIndex:
          packageIndex === undefined ? (remoteIndex ?? 0) : undefined,
        packageIndex,
      },
    );

    // Validate connection data based on type
    const isStdioConnection = connectionData.connection_type === "STDIO";
    const hasUrl = Boolean(connectionData.connection_url);
    const hasStdioConfig =
      isStdioConnection &&
      connectionData.connection_headers &&
      typeof connectionData.connection_headers === "object" &&
      "command" in connectionData.connection_headers;

    if (!hasUrl && !hasStdioConfig) {
      toast.error(
        "This MCP Server cannot be connected: no connection method available",
      );
      return;
    }

    try {
      const { id } = await actions.create.mutateAsync(connectionData);

      navigate({
        to: "/$org/mcps/$connectionId",
        params: { org: org.slug, connectionId: id },
      });
    } catch (error) {
      toast.error(
        `Failed to connect MCP Server: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  const handleBackClick = () => {
    navigate({
      to: "/$org/store",
      params: { org: org.slug },
    });
  };

  // Not found state
  if (!selectedItem) {
    return <MCPServerDetailNotFoundState onBack={handleBackClick} />;
  }

  if (!data) {
    return null;
  }

  // Check if server can be installed (must have remotes or packages)
  const hasRemotes = (selectedItem?.server?.remotes?.length ?? 0) > 0;
  const hasPackages = (selectedItem?.server?.packages?.length ?? 0) > 0;
  const canInstall = hasRemotes || hasPackages;

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
              hideInstallControls={hasMultipleServers}
              selectedVersionIndex={effectiveVersionIndex}
              onVersionChange={setSelectedVersionIndex}
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
                servers={allServers}
                onInstallServer={(entry) => {
                  // Use effective version index for installations from servers list
                  if (entry._type === "remote") {
                    handleInstall(
                      effectiveVersionIndex,
                      entry._index,
                      undefined,
                    );
                  } else {
                    handleInstall(
                      effectiveVersionIndex,
                      undefined,
                      entry._index,
                    );
                  }
                }}
                isInstalling={actions.create.isPending}
                mcpIcon={data.icon}
                mcpName={data.name}
                showStdio={showStdio}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StoreMCPServerDetail() {
  const { org } = useProjectContext();
  const navigate = useNavigate();

  const handleBackClick = () => {
    navigate({
      to: "/$org/store",
      params: { org: org.slug },
    });
  };

  return (
    <StoreMCPServerDetailErrorBoundary onBack={handleBackClick}>
      <Suspense fallback={<MCPServerDetailLoadingState />}>
        <StoreMCPServerDetailContent />
      </Suspense>
    </StoreMCPServerDetailErrorBoundary>
  );
}

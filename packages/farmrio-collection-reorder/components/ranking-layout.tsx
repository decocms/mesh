/**
 * Ranking Layout
 *
 * Self-contained layout for the collection reorder ranking plugin.
 * Uses one connection for reports and an optional second VTEX connection for apply.
 * Uses URL search params (?collectionId=...&reportId=...) for copyable URLs.
 */

import {
  REPORTS_BINDING,
  VTEX_REORDER_COLLECTION_BINDING,
  connectionImplementsBinding,
  type PluginContext,
} from "@decocms/bindings";
import { useNavigate, useSearch } from "@decocms/bindings/plugin-router";
import {
  SELF_MCP_ALIAS_ID,
  type ConnectionEntity,
  useConnections,
  useMCPClient,
  useMCPClientOptional,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { PluginContextProvider } from "@decocms/mesh-sdk/plugins";
import { Button } from "@deco/ui/components/button.tsx";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loading01, Settings01 } from "@untitledui/icons";
import { KEYS } from "../lib/query-keys";
import type { Collection } from "../lib/types";
import CollectionsList from "./collections-list";
import RankingDetail from "./ranking-detail";
import RankingEmptyState from "./ranking-empty-state";
import RankingsList from "./rankings-list";
import { VtexConnectionProvider } from "./vtex-connection-context";

function filterConnectionsByBinding(
  connections: ConnectionEntity[] | undefined,
): ConnectionEntity[] {
  if (!connections) return [];
  return connections.filter((conn) =>
    connectionImplementsBinding(conn, REPORTS_BINDING),
  );
}

type PluginConfigOutput = {
  config: {
    id: string;
    projectId: string;
    pluginId: string;
    connectionId: string | null;
    settings: Record<string, unknown> | null;
  } | null;
};

type SearchParams = {
  collectionId?: string;
  reportId?: string;
};

function parseCollections(
  settings: Record<string, unknown> | null,
): Collection[] {
  const rawCollections = settings?.collections;
  if (!Array.isArray(rawCollections)) return [];

  return rawCollections.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const maybeCollection = item as Record<string, unknown>;

    if (
      typeof maybeCollection.id !== "string" ||
      typeof maybeCollection.name !== "string" ||
      typeof maybeCollection.vtexCollectionId !== "string"
    ) {
      return [];
    }

    return [
      {
        id: maybeCollection.id,
        name: maybeCollection.name,
        vtexCollectionId: maybeCollection.vtexCollectionId,
      },
    ];
  });
}

export default function RankingLayout() {
  const { org, project } = useProjectContext();
  const search = useSearch({ strict: false }) as SearchParams;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const allConnections = useConnections();

  const collectionId = search.collectionId ?? null;
  const reportId = search.reportId ?? null;
  const pluginId = "collection-reorder-ranking";

  const setCollectionId = (id: string | null) => {
    navigate({
      search: id ? { collectionId: id } : {},
      replace: true,
    } as unknown as Parameters<typeof navigate>[0]);
  };

  const setReportId = (id: string | null) => {
    if (!collectionId) return;
    navigate({
      search: id ? { collectionId, reportId: id } : { collectionId },
      replace: true,
    } as unknown as Parameters<typeof navigate>[0]);
  };

  const selfClient = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const { data: pluginConfig, isLoading: isLoadingConfig } = useQuery({
    queryKey: KEYS.pluginConfig(project.id ?? "", pluginId),
    queryFn: async () => {
      const result = (await selfClient.callTool({
        name: "PROJECT_PLUGIN_CONFIG_GET",
        arguments: { projectId: project.id, pluginId },
      })) as { structuredContent?: unknown };
      return (result.structuredContent ?? result) as PluginConfigOutput;
    },
    enabled: !!project.id,
  });

  const validConnections = filterConnectionsByBinding(allConnections);
  const configuredConnectionId = pluginConfig?.config?.connectionId;
  const configuredConnection = configuredConnectionId
    ? validConnections.find((c) => c.id === configuredConnectionId)
    : null;
  const settings =
    pluginConfig?.config?.settings &&
    typeof pluginConfig.config.settings === "object"
      ? (pluginConfig.config.settings as Record<string, unknown>)
      : null;
  const collections = parseCollections(settings);
  const configuredVtexConnectionId =
    typeof settings?.vtexConnectionId === "string"
      ? settings.vtexConnectionId
      : null;
  const configuredVtexConnection = configuredVtexConnectionId
    ? (allConnections?.find(
        (conn) =>
          conn.id === configuredVtexConnectionId &&
          connectionImplementsBinding(conn, VTEX_REORDER_COLLECTION_BINDING),
      ) ?? null)
    : null;

  const configuredClient = useMCPClientOptional({
    connectionId: configuredConnection?.id,
    orgId: org.id,
  });
  const configuredVtexClient = useMCPClientOptional({
    connectionId: configuredVtexConnection?.id,
    orgId: org.id,
  });
  const selectedCollection = collectionId
    ? (collections.find((collection) => collection.id === collectionId) ?? null)
    : null;

  const orgContext = { id: org.id, slug: org.slug, name: org.name };

  const saveCollections = async (nextCollections: Collection[]) => {
    if (!project.id) {
      throw new Error("Project is not available");
    }

    await selfClient.callTool({
      name: "PROJECT_PLUGIN_CONFIG_UPDATE",
      arguments: {
        projectId: project.id,
        pluginId,
        connectionId: configuredConnection?.id ?? null,
        settings: {
          ...(settings ?? {}),
          collections: nextCollections,
        },
      },
    });

    await queryClient.invalidateQueries({
      queryKey: KEYS.pluginConfig(project.id, pluginId),
    });
  };

  const handleAddCollection = async (input: {
    name: string;
    vtexCollectionId: string;
  }) => {
    await saveCollections([
      ...collections,
      {
        id: crypto.randomUUID(),
        name: input.name,
        vtexCollectionId: input.vtexCollectionId,
      },
    ]);
  };

  const handleDeleteCollection = async (id: string) => {
    if (collectionId === id) {
      setCollectionId(null);
    }

    await saveCollections(
      collections.filter((collection) => collection.id !== id),
    );
  };

  if (isLoadingConfig) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loading01
          size={32}
          className="animate-spin text-muted-foreground mb-4"
        />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (validConnections.length === 0) {
    return <RankingEmptyState />;
  }

  if (!configuredConnection) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
        <div className="flex flex-col items-center gap-2 text-center max-w-md">
          <Settings01 size={48} className="text-muted-foreground mb-2" />
          <h2 className="text-lg font-semibold">Plugin Not Configured</h2>
          <p className="text-sm text-muted-foreground">
            This plugin requires a reports connection to be configured. Go to
            project settings to select which integration to use.
          </p>
        </div>
      </div>
    );
  }

  if (collectionId && !selectedCollection) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
        <div className="flex flex-col items-center gap-2 text-center max-w-md">
          <h2 className="text-lg font-semibold">Collection Not Found</h2>
          <p className="text-sm text-muted-foreground">
            The selected collection was not found in this project settings.
          </p>
        </div>
        <Button variant="outline" onClick={() => setCollectionId(null)}>
          Back to collections
        </Button>
      </div>
    );
  }

  const pluginContext: PluginContext<typeof REPORTS_BINDING> = {
    connectionId: configuredConnection.id,
    connection: {
      id: configuredConnection.id,
      title: configuredConnection.title,
      icon: configuredConnection.icon,
      description: configuredConnection.description,
      app_name: configuredConnection.app_name,
      app_id: configuredConnection.app_id,
      tools: configuredConnection.tools,
      metadata: configuredConnection.metadata,
    },
    toolCaller: ((toolName: string, args: unknown) =>
      configuredClient
        ? configuredClient
            .callTool({
              name: toolName,
              arguments: args as Record<string, unknown>,
            })
            .then((result) => result.structuredContent ?? result)
        : Promise.reject(
            new Error("MCP client is not available"),
          )) as PluginContext<typeof REPORTS_BINDING>["toolCaller"],
    org: orgContext,
    session: null,
  };

  const vtexContext = {
    connection: configuredVtexConnection
      ? {
          id: configuredVtexConnection.id,
          title: configuredVtexConnection.title,
          icon: configuredVtexConnection.icon,
          description: configuredVtexConnection.description,
          app_name: configuredVtexConnection.app_name,
          app_id: configuredVtexConnection.app_id,
          tools: configuredVtexConnection.tools,
          metadata: configuredVtexConnection.metadata,
        }
      : null,
    toolCaller: configuredVtexClient
      ? (
          toolName: "VTEX_REORDER_COLLECTION",
          args: { collectionId: string; xml: string },
        ) =>
          configuredVtexClient
            .callTool({
              name: toolName,
              arguments: args,
            })
            .then((result) => result.structuredContent ?? result)
      : null,
  };

  return (
    <PluginContextProvider value={pluginContext}>
      <VtexConnectionProvider value={vtexContext}>
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {!collectionId ? (
              <CollectionsList
                collections={collections}
                onSelectCollection={setCollectionId}
                onAddCollection={handleAddCollection}
                onDeleteCollection={handleDeleteCollection}
              />
            ) : reportId && selectedCollection ? (
              <RankingDetail
                reportId={reportId}
                onBack={() => setReportId(null)}
              />
            ) : selectedCollection ? (
              <RankingsList
                collection={selectedCollection}
                onBack={() => setCollectionId(null)}
                onSelectReport={setReportId}
              />
            ) : null}
          </div>
        </div>
      </VtexConnectionProvider>
    </PluginContextProvider>
  );
}

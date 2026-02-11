import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { KEYS } from "../lib/query-keys";
import type {
  RegistryBulkCreateResult,
  RegistryCreateInput,
  RegistryFilters,
  RegistryItem,
  RegistryListResponse,
  RegistryUpdateInput,
} from "../lib/types";

const DEFAULT_LIMIT = 24;

type ToolResult<T> = { structuredContent?: T } & T;

function normalizeSearch(search: string): string {
  return search.trim();
}

async function callTool<T>(
  client: ReturnType<typeof useMCPClient>,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = (await client.callTool({
    name,
    arguments: args,
  })) as
    | (ToolResult<T> & {
        isError?: boolean;
        content?: Array<{ type?: string; text?: string }>;
      })
    | undefined;

  if (!result || typeof result !== "object") {
    throw new Error(`Invalid tool response for ${name}`);
  }

  if (result.isError) {
    const message =
      result.content?.find((item) => item.type === "text")?.text ??
      `Tool ${name} returned an error`;
    throw new Error(message);
  }

  return (result.structuredContent ?? result) as T;
}

export function useRegistryItems(params: {
  search: string;
  tags: string[];
  categories: string[];
  limit?: number;
}) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const search = normalizeSearch(params.search);
  const limit = params.limit ?? DEFAULT_LIMIT;

  return useInfiniteQuery({
    queryKey: KEYS.itemsList(search, params.tags, params.categories),
    queryFn: async ({ pageParam }) => {
      const where =
        search.length > 0
          ? {
              operator: "or",
              conditions: [
                {
                  field: ["title"],
                  operator: "contains",
                  value: search,
                },
                {
                  field: ["description"],
                  operator: "contains",
                  value: search,
                },
                {
                  field: ["id"],
                  operator: "contains",
                  value: search,
                },
                {
                  field: ["server", "name"],
                  operator: "contains",
                  value: search,
                },
              ],
            }
          : undefined;

      return callTool<RegistryListResponse>(
        client,
        "COLLECTION_REGISTRY_APP_LIST",
        {
          cursor: pageParam as string | undefined,
          limit,
          tags: params.tags.length ? params.tags : undefined,
          categories: params.categories.length ? params.categories : undefined,
          where,
        },
      );
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 30_000,
  });
}

export function useRegistryFilters() {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return useQuery({
    queryKey: KEYS.filters(),
    queryFn: async () =>
      callTool<RegistryFilters>(client, "COLLECTION_REGISTRY_APP_FILTERS", {}),
    placeholderData: { tags: [], categories: [] },
    staleTime: 60_000,
  });
}

export function useRegistryMutations() {
  const queryClient = useQueryClient();
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: KEYS.items() }),
      queryClient.invalidateQueries({ queryKey: KEYS.filters() }),
      queryClient.refetchQueries({ queryKey: KEYS.items(), type: "active" }),
      queryClient.refetchQueries({ queryKey: KEYS.filters(), type: "active" }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: async (data: RegistryCreateInput) => {
      const response = await callTool<{ item: RegistryItem }>(
        client,
        "COLLECTION_REGISTRY_APP_CREATE",
        { data },
      );
      return response.item;
    },
    onSuccess: invalidateAll,
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: RegistryUpdateInput;
    }) => {
      const response = await callTool<{ item: RegistryItem }>(
        client,
        "COLLECTION_REGISTRY_APP_UPDATE",
        { id, data },
      );
      return response.item;
    },
    onSuccess: invalidateAll,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await callTool<{ item: RegistryItem | null }>(
        client,
        "COLLECTION_REGISTRY_APP_DELETE",
        { id },
      );
      return response.item;
    },
    onSuccess: invalidateAll,
  });

  const bulkCreateMutation = useMutation({
    mutationFn: async (items: RegistryCreateInput[]) =>
      callTool<RegistryBulkCreateResult>(
        client,
        "COLLECTION_REGISTRY_APP_BULK_CREATE",
        {
          items,
        },
      ),
    onSuccess: invalidateAll,
  });

  return {
    createMutation,
    updateMutation,
    deleteMutation,
    bulkCreateMutation,
  };
}

interface PluginConfigResponse {
  config: {
    settings: Record<string, unknown> | null;
  } | null;
}

interface RegistryConfigSettings {
  registryName?: string;
  registryIcon?: string;
  llmConnectionId?: string;
  llmModelId?: string;
}

export function useRegistryConfig(pluginId: string) {
  const { org, project } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: KEYS.registryConfigByPlugin(project.id ?? "", pluginId),
    queryFn: async () =>
      callTool<PluginConfigResponse>(client, "PROJECT_PLUGIN_CONFIG_GET", {
        projectId: project.id,
        pluginId,
      }),
    enabled: Boolean(project.id),
    staleTime: 60_000,
  });

  const saveRegistryConfigMutation = useMutation({
    mutationFn: async (settingsPatch: RegistryConfigSettings) => {
      const latestData = await callTool<PluginConfigResponse>(
        client,
        "PROJECT_PLUGIN_CONFIG_GET",
        {
          projectId: project.id,
          pluginId,
        },
      );
      const latestSettings =
        (latestData?.config?.settings as RegistryConfigSettings | null) ?? {};

      return callTool<PluginConfigResponse>(
        client,
        "PROJECT_PLUGIN_CONFIG_UPDATE",
        {
          projectId: project.id,
          pluginId,
          settings: {
            ...latestSettings,
            ...settingsPatch,
          },
        },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: KEYS.registryConfigByPlugin(project.id ?? "", pluginId),
      });
    },
  });

  const registryName =
    (configQuery.data?.config?.settings?.registryName as string | undefined) ??
    "Private Registry";
  const registryIcon =
    (configQuery.data?.config?.settings?.registryIcon as string | undefined) ??
    "";
  const registryLLMConnectionId =
    (configQuery.data?.config?.settings?.llmConnectionId as
      | string
      | undefined) ?? "";
  const registryLLMModelId =
    (configQuery.data?.config?.settings?.llmModelId as string | undefined) ??
    "";

  return {
    registryName,
    registryIcon,
    registryLLMConnectionId,
    registryLLMModelId,
    isLoadingConfig: configQuery.isLoading,
    saveRegistryConfigMutation,
  };
}

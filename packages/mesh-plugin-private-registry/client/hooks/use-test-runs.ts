import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { PLUGIN_ID } from "../../shared";
import { KEYS } from "../lib/query-keys";
import type {
  RegistryTestConfig,
  TestConnectionListResponse,
  TestResultListResponse,
  TestResultStatus,
  TestRun,
  TestRunListResponse,
  TestRunStatus,
} from "../lib/types";

type ToolResult<T> = { structuredContent?: T } & T;

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

export function useTestRunStart() {
  const queryClient = useQueryClient();
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return useMutation({
    mutationFn: async (config?: Partial<RegistryTestConfig>) =>
      callTool<{ run: TestRun }>(client, "REGISTRY_TEST_RUN_START", {
        config,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: KEYS.testRuns() }),
        queryClient.invalidateQueries({ queryKey: KEYS.testResults() }),
      ]);
    },
  });
}

export function useTestRunCancel() {
  const queryClient = useQueryClient();
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return useMutation({
    mutationFn: async (runId: string) =>
      callTool<{ run: TestRun }>(client, "REGISTRY_TEST_RUN_CANCEL", { runId }),
    onSuccess: async (_res, runId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: KEYS.testRuns() }),
        queryClient.invalidateQueries({ queryKey: KEYS.testRun(runId) }),
      ]);
    },
  });
}

export function useTestRuns(status?: TestRunStatus) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return useQuery({
    queryKey: KEYS.testRunsList(status),
    queryFn: async () =>
      callTool<TestRunListResponse>(client, "REGISTRY_TEST_RUN_LIST", {
        status,
        limit: 100,
      }),
    staleTime: 5_000,
  });
}

export function useTestRun(runId?: string) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return useQuery({
    queryKey: KEYS.testRun(runId),
    queryFn: async () =>
      callTool<{ run: TestRun | null }>(client, "REGISTRY_TEST_RUN_GET", {
        runId,
      }),
    enabled: Boolean(runId),
    refetchInterval: (query) => {
      const run = query.state.data?.run;
      return run?.status === "running" ? 3000 : false;
    },
  });
}

export function useTestResults(
  runId?: string,
  status?: TestResultStatus,
  runStatus?: TestRunStatus,
) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return useQuery({
    queryKey: KEYS.testResultsList(runId, status),
    queryFn: async () =>
      callTool<TestResultListResponse>(client, "REGISTRY_TEST_RESULT_LIST", {
        runId,
        status,
        limit: 200,
        offset: 0,
      }),
    enabled: Boolean(runId),
    staleTime: 5_000,
    refetchInterval: runStatus === "running" ? 3000 : false,
  });
}

export function useTestConnections() {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return useQuery({
    queryKey: KEYS.testConnections(),
    queryFn: async () =>
      callTool<TestConnectionListResponse>(
        client,
        "REGISTRY_TEST_CONNECTION_LIST",
        {},
      ),
    staleTime: 10_000,
  });
}

export function useSyncTestConnections() {
  const queryClient = useQueryClient();
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return useMutation({
    mutationFn: async () =>
      callTool<{ created: number; updated: number }>(
        client,
        "REGISTRY_TEST_CONNECTION_SYNC",
        {},
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: KEYS.testConnections() });
    },
  });
}

export function useUpdateTestConnectionAuth() {
  const queryClient = useQueryClient();
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return useMutation({
    mutationFn: async ({
      connectionId,
      authStatus,
    }: {
      connectionId: string;
      authStatus: string;
    }) =>
      callTool<{ success: boolean }>(
        client,
        "REGISTRY_TEST_CONNECTION_UPDATE_AUTH",
        { connectionId, authStatus },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: KEYS.testConnections() });
    },
  });
}

type PluginConfigResponse = {
  config: {
    settings: Record<string, unknown> | null;
  } | null;
};

const DEFAULT_TEST_SETTINGS: RegistryTestConfig = {
  testMode: "health_check",
  onFailure: "none",
  schedule: "manual",
  perMcpTimeoutMs: 30_000,
  perToolTimeoutMs: 10_000,
  testPublicOnly: false,
  testPrivateOnly: false,
  agentPrompt: "",
  llmConnectionId: "",
  llmModelId: "",
};

export function useRegistryTestConfig() {
  const { org, project } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: KEYS.registryConfigByPlugin(project.id ?? "", PLUGIN_ID),
    queryFn: async () =>
      callTool<PluginConfigResponse>(client, "PROJECT_PLUGIN_CONFIG_GET", {
        projectId: project.id,
        pluginId: PLUGIN_ID,
      }),
    enabled: Boolean(project.id),
  });

  // Test config is stored under settings.testConfig to avoid
  // conflicting with registry settings (registryName, registryIcon, etc.)
  const rawSettings = query.data?.config?.settings;
  const savedTestConfig =
    rawSettings && typeof rawSettings === "object"
      ? ((rawSettings as Record<string, unknown>).testConfig as
          | Partial<RegistryTestConfig>
          | undefined)
      : undefined;

  // Also check for legacy flat keys (migrate automatically)
  const legacyTestMode = rawSettings
    ? (rawSettings as Record<string, unknown>).testMode
    : undefined;
  const hasLegacyKeys = typeof legacyTestMode === "string";

  const settings: RegistryTestConfig = {
    ...DEFAULT_TEST_SETTINGS,
    ...(savedTestConfig ?? {}),
    // Fallback: read legacy flat keys if testConfig namespace doesn't exist yet
    ...(hasLegacyKeys && !savedTestConfig
      ? (rawSettings as Partial<RegistryTestConfig>)
      : {}),
  };

  const saveMutation = useMutation({
    mutationFn: async (patch: Partial<RegistryTestConfig>) => {
      // Fetch the latest settings to avoid overwriting registry config
      const latestData = await callTool<PluginConfigResponse>(
        client,
        "PROJECT_PLUGIN_CONFIG_GET",
        {
          projectId: project.id,
          pluginId: PLUGIN_ID,
        },
      );
      const latestSettings =
        (latestData?.config?.settings as Record<string, unknown>) ?? {};

      return callTool<PluginConfigResponse>(
        client,
        "PROJECT_PLUGIN_CONFIG_UPDATE",
        {
          projectId: project.id,
          pluginId: PLUGIN_ID,
          settings: {
            ...latestSettings,
            // Store test config under a dedicated namespace
            testConfig: {
              ...DEFAULT_TEST_SETTINGS,
              ...((latestSettings.testConfig as
                | Partial<RegistryTestConfig>
                | undefined) ?? {}),
              ...patch,
            },
          },
        },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: KEYS.registryConfigByPlugin(project.id ?? "", PLUGIN_ID),
      });
    },
  });

  return {
    settings,
    isLoading: query.isLoading,
    saveMutation,
  };
}

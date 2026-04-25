import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
  WellKnownOrgMCPId,
} from "@decocms/mesh-sdk";
import { KEYS } from "@/web/lib/query-keys";
import { toast } from "sonner";

export interface RegistryConfig {
  registries: Record<string, { enabled: boolean }>;
  blockedMcps: string[];
}

export function useRegistrySettings() {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: KEYS.registryConfig(org.id),
    queryFn: async () => {
      const result = (await client.callTool({
        name: "ORGANIZATION_SETTINGS_GET",
        arguments: {},
      })) as {
        structuredContent?: { registry_config?: RegistryConfig | null };
      };
      return (
        (
          (result.structuredContent ?? result) as {
            registry_config?: RegistryConfig | null;
          }
        ).registry_config ?? null
      );
    },
    staleTime: 30_000,
  });

  const registryConfig = data ?? null;

  const decoStoreId = WellKnownOrgMCPId.REGISTRY(org.id);

  const isRegistryEnabled = (connectionId: string): boolean => {
    if (!registryConfig) return connectionId === decoStoreId;
    const entry = registryConfig.registries[connectionId];
    if (!entry) return connectionId === decoStoreId;
    return entry.enabled;
  };

  const isMcpBlocked = (appNameOrId: string): boolean => {
    if (!registryConfig) return false;
    return registryConfig.blockedMcps.includes(appNameOrId);
  };

  const { mutateAsync: updateRegistryConfig } = useMutation({
    mutationFn: async (config: RegistryConfig) => {
      await client.callTool({
        name: "ORGANIZATION_SETTINGS_UPDATE",
        arguments: {
          organizationId: org.id,
          registry_config: config,
        },
      });
      return config;
    },
    onMutate: async (config) => {
      await queryClient.cancelQueries({
        queryKey: KEYS.registryConfig(org.id),
      });
      const previous = queryClient.getQueryData<RegistryConfig | null>(
        KEYS.registryConfig(org.id),
      );
      queryClient.setQueryData(KEYS.registryConfig(org.id), config);
      return { previous };
    },
    onError: (err, _config, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(KEYS.registryConfig(org.id), context.previous);
      }
      toast.error(`Failed to update store settings: ${err.message}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: KEYS.registryConfig(org.id),
      });
    },
  });

  return {
    registryConfig,
    isLoading,
    isRegistryEnabled,
    isMcpBlocked,
    updateRegistryConfig,
  };
}

import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
  type SimpleModeDefaults,
} from "@decocms/mesh-sdk";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { KEYS } from "../../lib/query-keys";

export interface SimpleModeConfig {
  enabled: boolean;
  chat: {
    fast: { keyId: string; modelId: string; title?: string } | null;
    smart: { keyId: string; modelId: string; title?: string } | null;
    thinking: { keyId: string; modelId: string; title?: string } | null;
  };
  image: { keyId: string; modelId: string; title?: string } | null;
  webResearch: { keyId: string; modelId: string; title?: string } | null;
}

const EMPTY_CONFIG: SimpleModeConfig = {
  enabled: false,
  chat: { fast: null, smart: null, thinking: null },
  image: null,
  webResearch: null,
};

export function useSimpleMode(): SimpleModeConfig {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const { data } = useQuery({
    queryKey: KEYS.aiSimpleMode(org.id),
    staleTime: 30_000,
    queryFn: async () => {
      const result = (await client.callTool({
        name: "AI_SIMPLE_MODE_GET",
        arguments: {},
      })) as { structuredContent?: SimpleModeConfig; isError?: boolean };
      if (result?.isError) return EMPTY_CONFIG;
      return result.structuredContent ?? EMPTY_CONFIG;
    },
  });

  return data ?? EMPTY_CONFIG;
}

export function useUpdateSimpleMode() {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: SimpleModeConfig) => {
      const result = (await client.callTool({
        name: "AI_SIMPLE_MODE_UPDATE",
        arguments: config as unknown as Record<string, unknown>,
      })) as { isError?: boolean; content?: { text?: string }[] };
      if (result?.isError) {
        throw new Error(
          result.content?.[0]?.text ?? "Failed to update Simple Mode config",
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.aiSimpleMode(org.id) });
    },
  });
}

export type { SimpleModeDefaults };

/**
 * Hook for auto-detecting tunnel availability.
 *
 * Polls FILESYSTEM_READ_TUNNEL_CONFIG via SELF MCP to check if the
 * project's tunnel URL is reachable. Stops polling when detected or
 * when no wrangler.toml is found.
 */

import { useQuery } from "@tanstack/react-query";
import { SELF_MCP_ALIAS_ID, useMCPClient } from "@decocms/mesh-sdk";
import { queryKeys } from "./query-keys";

interface TunnelConfig {
  tunnelUrl: string | null;
  workspace: string | null;
  app: string | null;
  reachable: boolean;
}

export interface UseTunnelDetectionResult {
  /** The computed tunnel URL, or null if no wrangler.toml */
  tunnelUrl: string | null;
  /** Whether the tunnel is currently reachable */
  reachable: boolean;
  /** Whether the initial query is still loading */
  isLoading: boolean;
  /** True when wrangler.toml is missing or has no workspace config */
  noWranglerToml: boolean;
}

export function useTunnelDetection(opts: {
  connectionId: string;
  projectPath: string;
  orgId: string;
  enabled?: boolean;
}): UseTunnelDetectionResult {
  const { connectionId, projectPath, orgId, enabled = true } = opts;
  const selfClient = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId,
  });

  const query = useQuery({
    queryKey: queryKeys.tunnel.detection(connectionId),
    queryFn: async (): Promise<TunnelConfig> => {
      const result = await selfClient.callTool({
        name: "FILESYSTEM_READ_TUNNEL_CONFIG",
        arguments: { path: projectPath },
      });
      return (result.structuredContent ?? {
        tunnelUrl: null,
        workspace: null,
        app: null,
        reachable: false,
      }) as TunnelConfig;
    },
    enabled: enabled && !!connectionId && !!projectPath,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Stop polling if: no wrangler.toml (tunnelUrl is null) or tunnel is reachable
      if (!data?.tunnelUrl || data?.reachable) return false;
      return 5000; // Poll every 5s while tunnel URL known but not reachable
    },
    refetchIntervalInBackground: false,
  });

  const data = query.data;

  return {
    tunnelUrl: data?.tunnelUrl ?? null,
    reachable: data?.reachable ?? false,
    isLoading: query.isLoading,
    noWranglerToml: data !== undefined && data.tunnelUrl === null,
  };
}

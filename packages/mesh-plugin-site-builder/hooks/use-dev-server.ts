/**
 * Dev Server Hook
 *
 * Checks if the Deco site dev server is running and provides status.
 * The user needs to start/stop the server manually via terminal.
 */

import { useQuery } from "@tanstack/react-query";
import { usePluginContext } from "@decocms/bindings/plugins";
import { SITE_BUILDER_BINDING } from "../lib/binding";
import { KEYS } from "../lib/query-keys";

const DEV_SERVER_PORT = 8000;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

export interface DevServerStatus {
  isRunning: boolean;
  meta: {
    site?: string;
    manifest?: {
      blocks?: Record<string, unknown>;
    };
  } | null;
}

export function useDevServer() {
  const { connectionId } = usePluginContext<typeof SITE_BUILDER_BINDING>();

  // Check if dev server is running by pinging the meta endpoint
  const {
    data: status,
    isLoading: isChecking,
    refetch,
  } = useQuery({
    queryKey: KEYS.devServerStatus(connectionId),
    queryFn: async (): Promise<DevServerStatus> => {
      try {
        const response = await fetch(`${DEV_SERVER_URL}/live/_meta`, {
          method: "GET",
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok) {
          const meta = await response.json();
          return { isRunning: true, meta };
        }
        return { isRunning: false, meta: null };
      } catch {
        return { isRunning: false, meta: null };
      }
    },
    refetchInterval: 5000, // Poll every 5 seconds
    staleTime: 2000,
  });

  return {
    isRunning: status?.isRunning ?? false,
    isChecking,
    meta: status?.meta ?? null,
    serverUrl: DEV_SERVER_URL,
    refetch,
    startCommand: "deno task start",
  };
}

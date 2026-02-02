/**
 * Dev Server Hook
 *
 * Checks if the Deco site dev server is running and provides control functions.
 * Uses DENO_TASK tool from local-fs MCP to start the server in background mode.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePluginContext } from "@decocms/bindings/plugins";
import { useState } from "react";
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

interface DenoTaskResult {
  success: boolean;
  task: string;
  background?: boolean;
  pid?: number;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  message?: string;
  error?: string;
}

export function useDevServer() {
  const { connectionId, toolCaller, connection } =
    usePluginContext<typeof SITE_BUILDER_BINDING>();
  const queryClient = useQueryClient();
  const [isStarting, setIsStarting] = useState(false);

  // Check if DENO_TASK tool is available
  const hasDenoTask = connection?.tools?.some((t) => t.name === "DENO_TASK");

  // Check if dev server is running by pinging the meta endpoint
  const {
    data: status,
    isLoading: isChecking,
    refetch,
  } = useQuery({
    queryKey: KEYS.devServerStatus(connectionId ?? ""),
    enabled: !!connectionId,
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

  // Start the dev server using DENO_TASK tool
  const startServer = async (): Promise<DenoTaskResult | null> => {
    if (!hasDenoTask || !toolCaller) {
      return null;
    }

    setIsStarting(true);
    try {
      // Cast for untyped tool call since DENO_TASK is checked dynamically
      const untypedToolCaller = toolCaller as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<unknown>;

      const result = (await untypedToolCaller("DENO_TASK", {
        task: "start",
        background: true,
      })) as DenoTaskResult;

      // Wait a bit for the server to start, then refetch status
      setTimeout(() => {
        if (connectionId) {
          queryClient.invalidateQueries({
            queryKey: KEYS.devServerStatus(connectionId),
          });
        }
        setIsStarting(false);
      }, 3000);

      return result;
    } catch (error) {
      setIsStarting(false);
      throw error;
    }
  };

  return {
    isRunning: status?.isRunning ?? false,
    isChecking,
    isStarting,
    meta: status?.meta ?? null,
    serverUrl: DEV_SERVER_URL,
    refetch,
    startCommand: "deno task start",
    startServer: hasDenoTask ? startServer : null,
    canStart: hasDenoTask && !status?.isRunning && !isStarting,
  };
}

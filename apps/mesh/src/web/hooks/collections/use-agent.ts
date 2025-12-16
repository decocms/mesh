/**
 * Agent Collection Hooks
 *
 * Provides React hooks for working with agents from remote connections
 * using React Query.
 */

import { UNKNOWN_CONNECTION_ID, createToolCaller } from "../../../tools/client";
import {
  useCollectionList,
  type UseCollectionListOptions,
} from "../use-collections";

// Agent type matching AgentSchema from @decocms/bindings
export interface Agent {
  id: string;
  title: string;
  description: string;
  instructions: string;
  tool_set: Record<string, string[]>;
  avatar: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

/**
 * Options for useAgentsFromConnection hook
 */
export type UseAgentsOptions = UseCollectionListOptions<Agent>;

/**
 * Hook to get all agents from a specific connection
 *
 * @param connectionId - The ID of the connection to fetch agents from
 * @param options - Filter and configuration options
 * @returns Suspense query result with agents
 */
export function useAgentsFromConnection(
  connectionId: string | undefined,
  options: UseAgentsOptions = {},
) {
  // Use a placeholder ID when connectionId is undefined to ensure hooks are always called
  // in the same order (Rules of Hooks compliance)
  const safeConnectionId = connectionId ?? UNKNOWN_CONNECTION_ID;
  const toolCaller = createToolCaller(safeConnectionId);

  return useCollectionList<Agent>(
    safeConnectionId,
    "AGENT",
    toolCaller,
    options,
  );
}

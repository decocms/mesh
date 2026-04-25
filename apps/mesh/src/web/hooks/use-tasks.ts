/**
 * Task (thread) hooks — mirror the useConnection/useConnections/useConnectionActions
 * pattern. Backed by COLLECTION_THREADS_* tools.
 */

import {
  SELF_MCP_ALIAS_ID,
  useCollectionActions,
  useCollectionItem,
  useCollectionList,
  useMCPClient,
  useProjectContext,
  type UseCollectionListOptions,
} from "@decocms/mesh-sdk";
import type { ThreadEntity } from "@/tools/thread/schema";

export type Task = ThreadEntity;

export type UseTasksOptions = UseCollectionListOptions<Task>;

/**
 * Single thread by id. Returns null when id is undefined; throws (Suspense)
 * on 404 — wrap in an error boundary if 404 is a valid state for the caller.
 */
export function useTask(id: string | undefined) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  return useCollectionItem<Task>(org.id, "THREADS", id, client);
}

/**
 * List threads. Filter via `options.filters` — e.g. `{ filters: [{ column: "virtual_mcp_id", value: vmcpId }] }`.
 */
export function useTasks(options: UseTasksOptions = {}) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  return useCollectionList<Task>(org.id, "THREADS", client, options);
}

/**
 * Mutation hooks. `create.mutateAsync({ id?, virtual_mcp_id, title?, description? })`.
 * `update.mutateAsync({ id, data })`. Note: the server ignores any `branch` you
 * pass to `create` — branch is derived from the vMCP.
 */
export function useTaskActions() {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  return useCollectionActions<Task>(org.id, "THREADS", client);
}

export { useEnsureTask } from "./use-ensure-task";

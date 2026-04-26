/**
 * useEnsureTask — read a task; on 404, create it with the given id and vMCP.
 *
 * Returns a discriminated union so the consumer can render the right UI:
 *   - { status: "loading" }   — initial GET in flight
 *   - { status: "creating" }  — create mutation in flight (after a 404)
 *   - { status: "ready", task: Task } — resolved
 *   - { status: "error", error: Error } — non-404 failure
 *
 * Race safety: the create mutation is server-side idempotent (`INSERT … ON
 * CONFLICT DO NOTHING RETURNING *`). Two tabs hitting the same URL both end
 * up with the same row.
 */

import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { KEYS } from "../lib/query-keys";
import type { ThreadCreateData } from "@/tools/thread/schema";
import { useTaskActions, type Task } from "./use-tasks";

type State =
  | { status: "loading" }
  | { status: "creating" }
  | { status: "ready"; task: Task }
  | { status: "error"; error: Error };

function isNotFoundError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return /not found/i.test(msg);
}

export function useEnsureTask(id: string, virtualMcpId: string): State {
  const { org, locator } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const actions = useTaskActions();
  const queryClient = useQueryClient();

  // Track which id we last fired the create mutation for. AgentInsetProvider
  // does not unmount between task navigations, so the hook (and the
  // useTaskActions mutation it owns) persists across id changes. We can't
  // rely on `actions.create.status === "idle"` (sticks at "success" after
  // the first create) or a boolean ref (never resets for the next id).
  // Refs mutate synchronously, which keeps the gate Strict-Mode safe.
  const createStartedForIdRef = useRef<string | null>(null);

  const query = useQuery<Task | null>({
    queryKey: KEYS.ensureTask(org.id, id),
    queryFn: async () => {
      const result = await client.callTool({
        name: "COLLECTION_THREADS_GET",
        arguments: { id },
      });
      const payload = (result as { structuredContent?: unknown })
        .structuredContent as { item?: Task } | undefined;
      return payload?.item ?? null;
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Fire create exactly once per id on 404. We invalidate both the
  // collection cache (covered by useCollectionActions.onSuccess) and the
  // legacy KEYS.tasksPrefix query (which chat-context's tasks.find() reads)
  // so the branch picker picks up the new thread immediately, then refetch
  // the local ensure query.
  if (query.isSuccess && !query.data && createStartedForIdRef.current !== id) {
    createStartedForIdRef.current = id;
    void actions.create
      .mutateAsync({
        id,
        virtual_mcp_id: virtualMcpId,
      } as ThreadCreateData)
      .then(() => {
        queryClient.invalidateQueries({
          queryKey: KEYS.tasksPrefix(locator),
        });
        return query.refetch();
      })
      .catch(() => {
        // mutation toast already fired; let render path show the error.
        // Reset the guard for THIS id so retry-on-remount can re-fire.
        if (createStartedForIdRef.current === id) {
          createStartedForIdRef.current = null;
        }
      });
  }

  if (query.isLoading) return { status: "loading" };
  if (query.isError && !isNotFoundError(query.error)) {
    return { status: "error", error: query.error as Error };
  }
  if (query.isSuccess && query.data) {
    return { status: "ready", task: query.data };
  }
  if (actions.create.isPending || (query.isSuccess && !query.data)) {
    return { status: "creating" };
  }
  if (actions.create.isError) {
    return { status: "error", error: actions.create.error as Error };
  }
  return { status: "loading" };
}

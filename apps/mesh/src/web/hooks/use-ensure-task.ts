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
import { useQuery } from "@tanstack/react-query";
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
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const actions = useTaskActions();

  // Track whether we've fired the create mutation to avoid re-triggering
  // under React 19 concurrent rendering / Strict Mode. Refs mutate
  // synchronously; mutation status does not.
  const createStartedRef = useRef(false);

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

  // Fire create exactly once on 404. The mutation invalidates the collection,
  // which re-runs this query through useTask consumers; we also refetch the
  // local one explicitly.
  if (
    query.isSuccess &&
    !query.data &&
    actions.create.status === "idle" &&
    !createStartedRef.current
  ) {
    createStartedRef.current = true;
    void actions.create
      .mutateAsync({
        id,
        virtual_mcp_id: virtualMcpId,
      } as ThreadCreateData)
      .then(() => query.refetch())
      .catch(() => {
        // mutation toast already fired; let render path show the error
        createStartedRef.current = false; // allow retry on transient failure
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

/**
 * useEnsureTask — read a task by id; report whether the row exists yet.
 *
 * Threads are created lazily on the first user message (see chat-context's
 * sendMessage path), so a missing row is the expected state for a freshly
 * navigated `/$org/$taskId` URL. Returning `task: null` lets the chat render
 * an empty conversation without a phantom row appearing in the task list.
 *
 * Returns a discriminated union so the consumer can render the right UI:
 *   - { status: "loading" }                  — initial GET in flight
 *   - { status: "ready", task: Task | null } — row exists, or doesn't yet
 *   - { status: "error", error: Error }      — non-recoverable failure
 */

import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { useQuery } from "@tanstack/react-query";
import { KEYS } from "../lib/query-keys";
import type { Task } from "./use-tasks";

type State =
  | { status: "loading" }
  | { status: "ready"; task: Task | null }
  | { status: "error"; error: Error };

export function useEnsureTask(id: string): State {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const query = useQuery<Task | null>({
    queryKey: KEYS.ensureTask(org.id, id),
    queryFn: async () => {
      const result = await client.callTool({
        name: "COLLECTION_THREADS_GET",
        arguments: { id },
      });
      const payload = (result as { structuredContent?: unknown })
        .structuredContent as { item?: Task | null } | undefined;
      return payload?.item ?? null;
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (query.isLoading) return { status: "loading" };
  if (query.isError) return { status: "error", error: query.error as Error };
  if (query.isSuccess) {
    return { status: "ready", task: query.data ?? null };
  }
  return { status: "loading" };
}

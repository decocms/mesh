/**
 * useNavigateToNewTask — prefills task + messages caches, then navigates.
 *
 * Designed for use *outside* ChatContextProvider (e.g., sidebar).
 * Creates an optimistic task, seeds the React Query caches so that
 * ChatContextProvider mounts without triggering Suspense, then navigates
 * to the new virtual MCP with the taskId already in the URL.
 */

import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { authClient } from "../lib/auth-client";
import { LOCALSTORAGE_KEYS } from "../lib/localstorage-keys";
import { addTaskToCache } from "../components/chat/task/cache-operations";
import { buildOptimisticTask } from "../components/chat/task/helpers";
import { useCollectionCachePrefill } from "./use-collection-cache-prefill";
import { TASK_CONSTANTS } from "../components/chat/task/types";
import type { TaskOwnerFilter } from "../components/chat/task/use-task-manager";

/**
 * Returns a function that creates an optimistic task, prefills caches,
 * and navigates to `/$org/$virtualMcpId?taskId=<newId>`.
 */
export function useNavigateToNewTask() {
  const navigate = useNavigate();
  const { org, locator } = useProjectContext();
  const queryClient = useQueryClient();
  const { prefillCollectionCache } = useCollectionCachePrefill();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return (virtualMcpId: string) => {
    const newTaskId = crypto.randomUUID();
    const optimisticTask = buildOptimisticTask(newTaskId, virtualMcpId);

    // Read the persisted owner filter so we seed the right cache key
    let ownerFilter: TaskOwnerFilter = "me";
    try {
      const stored = localStorage.getItem(
        LOCALSTORAGE_KEYS.chatTaskOwnerFilter(locator),
      );
      if (stored) {
        ownerFilter = JSON.parse(stored) as TaskOwnerFilter;
      }
    } catch {
      // ignore
    }

    // Seed the tasks cache for the target virtual MCP
    addTaskToCache(
      queryClient,
      locator,
      optimisticTask,
      ownerFilter,
      ownerFilter === "me" ? userId : undefined,
      virtualMcpId,
    );

    // Seed the messages cache so useTaskMessages won't suspend
    if (client) {
      prefillCollectionCache(client, "THREAD_MESSAGES", org.id, {
        filters: [{ column: "thread_id", value: newTaskId }],
        pageSize: TASK_CONSTANTS.TASK_MESSAGES_PAGE_SIZE,
      });
    }

    // Navigate with taskId already in the URL
    navigate({
      to: "/$org/$virtualMcpId/",
      params: { org: org.slug, virtualMcpId },
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        taskId: newTaskId,
      }),
    });
  };
}

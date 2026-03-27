/**
 * useCreateTaskAndNavigate — for use *outside* ChatContextProvider (e.g., sidebar).
 *
 * Creates an optimistic task via the shared createOptimisticTaskInCache utility,
 * then navigates to the new agent route with the taskId in the URL.
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
import { createOptimisticTaskInCache } from "../components/chat/task-operations";
import type { TaskOwnerFilter } from "../components/chat/task/use-task-manager";

/**
 * Returns a function that creates an optimistic task, prefills caches,
 * and navigates to `/$org/$virtualMcpId?taskId=<newId>`.
 */
export function useCreateTaskAndNavigate() {
  const navigate = useNavigate();
  const { org, locator } = useProjectContext();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return (virtualMcpId: string) => {
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

    const newTaskId = createOptimisticTaskInCache({
      queryClient,
      locator,
      virtualMcpId,
      ownerFilter,
      userId,
      client,
      orgId: org.id,
    });

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

/**
 * Task Manager — React Query hooks for thread/task management.
 *
 * Scoped by virtualMcpId: only fetches threads for the current agent.
 * Keeps an org-wide SSE subscription for real-time sidebar status updates.
 * URL owns the active task ID — this hook no longer manages it.
 */

import type { CollectionListOutput } from "@decocms/bindings/collections";
import type { CollectionEntity } from "@decocms/mesh-sdk";
import type { ProjectLocator } from "@decocms/mesh-sdk";
import {
  SELF_MCP_ALIAS_ID,
  useCollectionList,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import {
  useQueryClient,
  useSuspenseInfiniteQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient } from "../../../lib/auth-client";
import { useCollectionCachePrefill } from "../../../hooks/use-collection-cache-prefill";
import { LOCALSTORAGE_KEYS } from "../../../lib/localstorage-keys";
import { KEYS } from "../../../lib/query-keys";
import { useDecopilotEvents } from "../../../hooks/use-decopilot-events";
import {
  addTaskToCache,
  updateMessagesCache,
  updateTaskInCache,
} from "./cache-operations.ts";
import { buildOptimisticTask, callUpdateTaskTool } from "./helpers.ts";
import { useState, useTransition } from "react";
import type { ChatMessage, Task, TasksInfiniteQueryData } from "./types.ts";
import { TASK_CONSTANTS } from "./types.ts";

export type TaskOwnerFilter = "me" | "everyone";

// ============================================================================
// useTasks — fetch task list scoped by virtualMcpId
// ============================================================================

function useTasks(
  ownerFilter: TaskOwnerFilter,
  userId: string | undefined,
  virtualMcpId: string,
) {
  const { locator, org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useSuspenseInfiniteQuery({
      queryKey: KEYS.tasks(
        locator,
        ownerFilter,
        ownerFilter === "me" ? userId : undefined,
        virtualMcpId,
      ),
      queryFn: async ({ pageParam = 0 }) => {
        if (!client) {
          throw new Error("MCP client is not available");
        }
        const input = {
          limit: TASK_CONSTANTS.TASKS_PAGE_SIZE,
          offset: pageParam,
          where: {
            ...(ownerFilter === "me" && { created_by: "me" }),
            virtual_mcp_id: virtualMcpId,
          },
        };

        const result = (await client.callTool({
          name: "COLLECTION_THREADS_LIST",
          arguments: input,
        })) as { structuredContent?: unknown };
        const payload = (result.structuredContent ??
          result) as CollectionListOutput<Task>;

        return {
          items: payload.items ?? [],
          hasMore: payload.hasMore ?? false,
          totalCount: payload.totalCount,
        };
      },
      getNextPageParam: (lastPage, allPages) => {
        if (!lastPage.hasMore) return undefined;
        return allPages.length * TASK_CONSTANTS.TASKS_PAGE_SIZE;
      },
      initialPageParam: 0,
      staleTime: TASK_CONSTANTS.QUERY_STALE_TIME,
    });

  const tasks = data?.pages.flatMap((page) => page.items) ?? [];
  return { tasks, refetch, hasNextPage, isFetchingNextPage, fetchNextPage };
}

// ============================================================================
// useTaskMessages — fetch messages for a specific task (exported for provider)
// ============================================================================

export function useTaskMessages(taskId: string | null) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  // Pass null client when no taskId to skip the query entirely
  const data = useCollectionList<CollectionEntity & ChatMessage>(
    org.id,
    "THREAD_MESSAGES",
    taskId ? client : null,
    {
      filters: taskId ? [{ column: "thread_id", value: taskId }] : [],
      pageSize: TASK_CONSTANTS.TASK_MESSAGES_PAGE_SIZE,
    },
  ) as ChatMessage[] | undefined;

  return data ?? [];
}

// ============================================================================
// useTaskManager — unified task management hook
// ============================================================================

export function useTaskManager(virtualMcpId: string) {
  const { locator, org } = useProjectContext();
  const queryClient = useQueryClient();
  const { prefillCollectionCache } = useCollectionCachePrefill();

  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;

  // Owner filter (localStorage-backed)
  const readStoredFilter = (loc: ProjectLocator): TaskOwnerFilter => {
    try {
      const stored = localStorage.getItem(
        LOCALSTORAGE_KEYS.chatTaskOwnerFilter(loc),
      );
      return stored ? (JSON.parse(stored) as TaskOwnerFilter) : "me";
    } catch {
      return "me";
    }
  };

  const [ownerFilter, rawSetOwnerFilter] = useState<TaskOwnerFilter>(() =>
    readStoredFilter(locator),
  );

  const [prevLocator, setPrevLocator] = useState(locator);
  if (prevLocator !== locator) {
    setPrevLocator(locator);
    rawSetOwnerFilter(readStoredFilter(locator));
  }

  const [isFilterChangePending, startFilterTransition] = useTransition();

  const setOwnerFilter = (filter: TaskOwnerFilter) => {
    startFilterTransition(() => rawSetOwnerFilter(filter));
    try {
      localStorage.setItem(
        LOCALSTORAGE_KEYS.chatTaskOwnerFilter(locator),
        JSON.stringify(filter),
      );
    } catch {
      // ignore
    }
  };

  // Fetch tasks (scoped by virtualMcpId)
  const { tasks, hasNextPage, isFetchingNextPage, fetchNextPage } = useTasks(
    ownerFilter,
    userId,
    virtualMcpId,
  );

  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  // Create task (optimistic + cache)
  const createTask = (): string => {
    const newTaskId = crypto.randomUUID();
    const optimisticTask = buildOptimisticTask(newTaskId, virtualMcpId);
    addTaskToCache(
      queryClient,
      locator,
      optimisticTask,
      ownerFilter,
      ownerFilter === "me" ? userId : undefined,
      virtualMcpId,
    );
    if (client) {
      prefillCollectionCache(client, "THREAD_MESSAGES", org.id, {
        filters: [{ column: "thread_id", value: newTaskId }],
        pageSize: TASK_CONSTANTS.TASK_MESSAGES_PAGE_SIZE,
      });
    }
    return newTaskId;
  };

  // Update task in cache
  const updateTask = (taskId: string, updates: Partial<Task>) => {
    updateTaskInCache(
      queryClient,
      locator,
      taskId,
      updates,
      ownerFilter,
      ownerFilter === "me" ? userId : undefined,
      virtualMcpId,
    );
  };

  // Set task status (backend + cache)
  // If the thread doesn't exist server-side (cache-only), apply the transition locally.
  const setTaskStatus = async (taskId: string, status: string) => {
    try {
      const updatedTask = await callUpdateTaskTool(client, taskId, {
        status: status as
          | "requires_action"
          | "failed"
          | "in_progress"
          | "completed",
      });
      const updates = {
        status: updatedTask?.status ?? status,
        updated_at: updatedTask?.updated_at ?? new Date().toISOString(),
      };
      for (const filter of ["me", "everyone"] as const) {
        updateTaskInCache(
          queryClient,
          locator,
          taskId,
          updates,
          filter,
          filter === "me" ? userId : undefined,
          virtualMcpId,
        );
      }
    } catch (error) {
      const err = error as Error;
      toast.error(`Failed to update task status: ${err.message}`);
      console.error("[chat] Failed to set task status:", error);
    }
  };

  // Rename task (backend + cache)
  const renameTask = async (taskId: string, title: string) => {
    try {
      const updatedTask = await callUpdateTaskTool(client, taskId, { title });
      if (updatedTask) {
        updateTaskInCache(
          queryClient,
          locator,
          taskId,
          {
            title,
            updated_at: updatedTask.updated_at ?? new Date().toISOString(),
          },
          ownerFilter,
          ownerFilter === "me" ? userId : undefined,
          virtualMcpId,
        );
      }
    } catch (error) {
      const err = error as Error;
      toast.error(`Failed to rename task: ${err.message}`);
      console.error("[chat] Failed to rename task:", error);
    }
  };

  // Hide task (backend + cache)
  const hideTask = async (taskId: string) => {
    try {
      await callUpdateTaskTool(client, taskId, { hidden: true });
    } catch (error) {
      const err = error as Error;
      toast.error(`Failed to update task: ${err.message}`);
      console.error("[chat] Failed to hide task:", error);
      return;
    }
    updateTaskInCache(
      queryClient,
      locator,
      taskId,
      { hidden: true, updated_at: new Date().toISOString() },
      ownerFilter,
      ownerFilter === "me" ? userId : undefined,
      virtualMcpId,
    );
  };

  // Update messages cache
  const updateMessagesInCache = (
    taskId: string,
    newMessages: ChatMessage[],
  ) => {
    updateMessagesCache(queryClient, client, org.id, taskId, newMessages);
  };

  // Org-wide SSE for real-time sidebar task status updates
  useDecopilotEvents({
    orgId: org.id,
    enabled: true,
    onTaskStatus: (event) => {
      const threadId = event.subject;
      const newStatus = event.data.status;
      const updatedAt = event.time;

      let foundInCache = false;
      for (const filter of ["me", "everyone"] as const) {
        const filterUserId = filter === "me" ? userId : undefined;
        const cached = queryClient.getQueryData<TasksInfiniteQueryData>(
          KEYS.tasks(locator, filter, filterUserId, virtualMcpId),
        );
        const inCache =
          cached?.pages.some((p) => p.items.some((t) => t.id === threadId)) ??
          false;

        if (inCache) {
          foundInCache = true;
          updateTaskInCache(
            queryClient,
            locator,
            threadId,
            { status: newStatus, updated_at: updatedAt },
            filter,
            filterUserId,
            virtualMcpId,
          );
        }
      }

      // Task not in cache — refetch so new tasks appear in the list
      if (!foundInCache) {
        queryClient.invalidateQueries({ queryKey: KEYS.tasks(locator) });
      }
    },
  });

  return {
    tasks,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    ownerFilter,
    setOwnerFilter,
    isFilterChangePending,
    createTask,
    updateTask,
    renameTask,
    hideTask,
    setTaskStatus,
    updateMessagesCache: updateMessagesInCache,
  };
}

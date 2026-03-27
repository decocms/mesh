import type { CollectionListOutput } from "@decocms/bindings/collections";
import type { CollectionEntity } from "@decocms/mesh-sdk";
import { buildCollectionQueryKey } from "@decocms/mesh-sdk";
import type { QueryClient } from "@tanstack/react-query";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { KEYS } from "../../../lib/query-keys";
import type { ChatMessage, Task, TasksQueryData } from "./types.ts";
import { TASK_CONSTANTS } from "./types.ts";

/**
 * Update task in React Query cache
 */
export function updateTaskInCache(
  queryClient: QueryClient,
  locator: string,
  taskId: string,
  updates: Partial<Task>,
  ownerFilter?: "me" | "everyone",
  userId?: string | null,
  virtualMcpId?: string,
): void {
  const queryKey = KEYS.tasks(locator, ownerFilter, userId, virtualMcpId);

  const currentData = queryClient.getQueryData<TasksQueryData>(queryKey);

  if (!currentData) {
    return;
  }

  const taskIndex = currentData.items.findIndex((task) => task.id === taskId);
  if (taskIndex === -1) {
    return;
  }

  const currentTask = currentData.items[taskIndex];
  if (!currentTask) {
    return;
  }

  const updatedTask: Task = {
    ...currentTask,
    title: updates.title ?? currentTask.title,
    updated_at: updates.updated_at ?? currentTask.updated_at,
    hidden: updates.hidden ?? currentTask.hidden,
    status: updates.status ?? currentTask.status,
  };

  const updatedItems = [...currentData.items];
  updatedItems[taskIndex] = updatedTask;

  queryClient.setQueryData(queryKey, {
    ...currentData,
    items: updatedItems,
  });
}

/**
 * Add task optimistically to the cache
 */
export function addTaskToCache(
  queryClient: QueryClient,
  locator: string,
  task: Task,
  ownerFilter?: "me" | "everyone",
  userId?: string | null,
  virtualMcpId?: string,
): void {
  const queryKey = KEYS.tasks(locator, ownerFilter, userId, virtualMcpId);

  const currentData = queryClient.getQueryData<TasksQueryData>(queryKey);

  if (!currentData) {
    queryClient.setQueryData(queryKey, {
      items: [task],
      hasMore: false,
      totalCount: 1,
    });
    return;
  }

  // Check if task already exists in cache
  const taskExists = currentData.items.some((t) => t.id === task.id);
  if (taskExists) {
    return;
  }

  queryClient.setQueryData(queryKey, {
    ...currentData,
    items: [task, ...currentData.items],
    totalCount: (currentData.totalCount ?? currentData.items.length) + 1,
  });
}

/**
 * Update messages cache for a task with new messages
 * Populates the cache directly without refetching from backend
 */
export function updateMessagesCache(
  queryClient: QueryClient,
  client: Client | null,
  orgId: string,
  taskId: string,
  messages: ChatMessage[],
): void {
  if (!client) {
    return;
  }

  const queryKey = buildCollectionQueryKey(client, "THREAD_MESSAGES", orgId, {
    filters: [{ column: "thread_id", value: taskId }],
    pageSize: TASK_CONSTANTS.TASK_MESSAGES_PAGE_SIZE,
  });

  if (!queryKey) {
    return;
  }

  // Update cache with new messages in the format expected by useCollectionList
  // This matches the structure returned by the MCP tool (before select transformation)
  // Use type assertion similar to useTaskMessages since runtime structure works correctly
  queryClient.setQueryData(queryKey, {
    structuredContent: {
      items: messages as (CollectionEntity & ChatMessage)[],
    } satisfies CollectionListOutput<CollectionEntity & ChatMessage>,
    isError: false,
  });
}

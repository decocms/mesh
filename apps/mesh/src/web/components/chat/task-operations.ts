/**
 * task-operations.ts — Pure utility for optimistic task creation.
 *
 * Used by both TaskProvider.createTask() and useCreateTaskAndNavigate() (sidebar).
 * Single source of truth for cache seeding — no duplication.
 */

import type { QueryClient } from "@tanstack/react-query";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type {
  CollectionEntity,
  UseCollectionListOptions,
} from "@decocms/mesh-sdk";
import { buildCollectionQueryKey } from "@decocms/mesh-sdk";
import type { CollectionListOutput } from "@decocms/bindings/collections";
import { addTaskToCache } from "./task/cache-operations";
import { buildOptimisticTask } from "./task/helpers";
import { TASK_CONSTANTS } from "./task/types";
import type { TaskOwnerFilter } from "./task/use-task-manager";

/**
 * Creates an optimistic task in the React Query cache and prefills
 * the messages cache so useTaskMessages won't suspend.
 *
 * Returns the generated task ID.
 */
export function createOptimisticTaskInCache(opts: {
  queryClient: QueryClient;
  locator: string;
  virtualMcpId: string;
  ownerFilter: TaskOwnerFilter;
  userId: string | undefined;
  client: Client | null;
  orgId: string;
}): string {
  const newTaskId = crypto.randomUUID();
  const optimisticTask = buildOptimisticTask(newTaskId, opts.virtualMcpId);

  addTaskToCache(
    opts.queryClient,
    opts.locator,
    optimisticTask,
    opts.ownerFilter,
    opts.ownerFilter === "me" ? opts.userId : undefined,
    opts.virtualMcpId,
  );

  // Prefill messages cache with empty result to prevent Suspense
  if (opts.client) {
    prefillCollectionCache(
      opts.queryClient,
      opts.client,
      "THREAD_MESSAGES",
      opts.orgId,
      {
        filters: [{ column: "thread_id", value: newTaskId }],
        pageSize: TASK_CONSTANTS.TASK_MESSAGES_PAGE_SIZE,
      },
    );
  }

  return newTaskId;
}

/**
 * Prefills a collection query cache with an empty result.
 * Inlined from useCollectionCachePrefill to work as a pure function.
 */
function prefillCollectionCache<T extends CollectionEntity>(
  queryClient: QueryClient,
  client: Client,
  collectionName: string,
  scopeKey: string,
  options?: UseCollectionListOptions<T>,
): void {
  const queryKey = buildCollectionQueryKey(
    client,
    collectionName,
    scopeKey,
    options,
  );
  if (!queryKey || queryClient.getQueryData(queryKey)) return;

  queryClient.setQueryData(queryKey, {
    structuredContent: {
      items: [],
    } satisfies CollectionListOutput<T>,
    isError: false,
  });
}

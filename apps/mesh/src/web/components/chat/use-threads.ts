/**
 * Chat Store Hooks using React Query + IndexedDB
 *
 * Provides React hooks for working with threads and messages stored in IndexedDB.
 * Uses TanStack React Query for caching and mutations with idb-keyval for persistence.
 */

import type {
  CollectionListInput,
  CollectionListOutput,
} from "@decocms/bindings/collections";
import type { CollectionEntity } from "@decocms/mesh-sdk";
import {
  SELF_MCP_ALIAS_ID,
  useCollectionList,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import type { Message, Thread } from "./types.ts";
import { KEYS } from "../../lib/query-keys";
import { useCollectionCachePrefill } from "../../hooks/use-collection-cache-prefill";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

/**
 * Constants for thread-related functionality
 */
const THREAD_CONSTANTS = {
  /** Page size for thread messages queries */
  THREAD_MESSAGES_PAGE_SIZE: 100,
  /** Page size for threads list queries */
  THREADS_PAGE_SIZE: 50,
  /** Stale time for React Query queries (30 seconds) */
  QUERY_STALE_TIME: 30_000,
} as const;

/**
 * Hook to get all threads with infinite scroll pagination
 *
 * @returns Object with threads array, pagination helpers, and refetch function
 */
export function useThreads() {
  const { locator, org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useSuspenseInfiniteQuery({
      queryKey: KEYS.threads(locator),
      queryFn: async ({ pageParam = 0 }) => {
        if (!client) {
          throw new Error("MCP client is not available");
        }
        const input: CollectionListInput = {
          limit: THREAD_CONSTANTS.THREADS_PAGE_SIZE,
          offset: pageParam,
        };

        const result = (await client.callTool({
          name: "COLLECTION_THREADS_LIST",
          arguments: input,
        })) as { structuredContent?: unknown };
        const payload = (result.structuredContent ??
          result) as CollectionListOutput<Thread>;

        return {
          items: payload.items ?? [],
          hasMore: payload.hasMore ?? false,
          totalCount: payload.totalCount,
        };
      },
      getNextPageParam: (lastPage, allPages) => {
        if (!lastPage.hasMore) {
          return undefined;
        }
        return allPages.length * THREAD_CONSTANTS.THREADS_PAGE_SIZE;
      },
      initialPageParam: 0,
      staleTime: THREAD_CONSTANTS.QUERY_STALE_TIME,
    });

  // Flatten all pages into a single threads array
  const threads = data?.pages.flatMap((page) => page.items) ?? [];

  return {
    threads,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  };
}

/**
 * Hook to get messages for a specific thread
 *
 * @param threadId - The ID of the thread
 * @returns Suspense query result with messages array
 */
export function useThreadMessages(threadId: string | null) {
  const { org } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  // Use type assertion since ThreadMessageEntity doesn't extend CollectionEntity
  // but the runtime behavior works correctly
  const data = useCollectionList<CollectionEntity & Message>(
    org.id,
    "THREAD_MESSAGES",
    client,
    {
      filters: threadId ? [{ column: "threadId", value: threadId }] : [],
      pageSize: THREAD_CONSTANTS.THREAD_MESSAGES_PAGE_SIZE,
    },
  ) as Message[] | undefined;

  return data ?? [];
}

/**
 * Hook that provides utilities to prefill thread messages cache
 * Prevents suspension when switching to a new thread
 *
 * @param client - The MCP client used to call collection tools
 * @param orgId - The organization ID
 * @returns Function to prefill cache for a specific thread ID
 */
export function useThreadMessagesPrefill(
  client: Client | null | undefined,
  orgId: string,
) {
  const { prefillCollectionCache } = useCollectionCachePrefill();

  return (threadId: string) => {
    if (!client) {
      return;
    }

    prefillCollectionCache(client, "THREAD_MESSAGES", orgId, {
      filters: [{ column: "threadId", value: threadId }],
      pageSize: THREAD_CONSTANTS.THREAD_MESSAGES_PAGE_SIZE,
    });
  };
}

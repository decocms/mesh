/**
 * Chat Store Hooks using React Query + IndexedDB
 *
 * Provides React hooks for working with threads and messages stored in IndexedDB.
 * Uses TanStack React Query for caching and mutations with idb-keyval for persistence.
 */

import { useSuspenseQuery } from "@tanstack/react-query";
import { KEYS } from "../lib/query-keys";
import { useProjectContext } from "../providers/project-context-provider";
import type { Message, Thread } from "../components/chat/types.ts";
import { createToolCaller } from "@/tools/client.ts";
import {
  CollectionListInput,
  CollectionListOutput,
} from "@decocms/bindings/collections";

/**
 * Hook to get all threads, optionally filtered by virtual MCP (agent)
 *
 * @param options - Optional filter options
 * @param options.virtualMcpId - Filter threads by virtual MCP ID
 * @returns Object with threads array and refetch function
 */
export function useThreads() {
  const { locator } = useProjectContext();
  const toolCaller = createToolCaller();
  const listToolName = "COLLECTION_THREADS_LIST";
  const input: CollectionListInput = {
    limit: 100,
    offset: 0,
  };

  const { data, refetch } = useSuspenseQuery({
    queryKey: KEYS.threads(locator),
    queryFn: async () => {
      const persistedThreads = (await toolCaller(
        listToolName,
        input,
      )) as CollectionListOutput<Thread>;

      return persistedThreads.items ?? [];
    },
    staleTime: 30_000,
  });

  return { threads: data ?? [], refetch };
}

async function getThreadMessages(threadId: string) {
  try {
    const toolCaller = createToolCaller();
    const listToolName = "COLLECTION_THREAD_MESSAGES_LIST";
    const input: CollectionListInput & { threadId: string | null } = {
      threadId,
      limit: 100,
      offset: 0,
    };
    const result = (await toolCaller(
      listToolName,
      input,
    )) as CollectionListOutput<Message>;
    return result.items ?? [];
  } catch (error) {
    console.error({ error });
    return [];
  }
}

/**
 * Hook to get messages for a specific thread
 *
 * @param threadId - The ID of the thread
 * @returns Suspense query result with messages array
 */
export function useThreadMessages(threadId: string | null) {
  const { locator } = useProjectContext();

  const { data } = useSuspenseQuery({
    queryKey: KEYS.threadMessages(locator, threadId ?? ""),
    queryFn: async () => {
      try {
        if (!threadId) {
          return [];
        }
        return await getThreadMessages(threadId);
      } catch (error) {
        console.error({ error });
        return [];
      }
    },

    staleTime: 30_000,
  });
  return data ?? [];
}

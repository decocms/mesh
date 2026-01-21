/**
 * Chat Store Hooks using React Query + IndexedDB
 *
 * Provides React hooks for working with threads and messages stored in IndexedDB.
 * Uses TanStack React Query for caching and mutations with idb-keyval for persistence.
 */

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { KEYS } from "../lib/query-keys";
import { useProjectContext } from "../providers/project-context-provider";
import type { Message, Thread } from "../components/chat/types.ts";
import { createToolCaller } from "@/tools/client.ts";
import {
  CollectionInsertOutput,
  CollectionListInput,
  CollectionListOutput,
  CollectionUpdateOutput,
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
}

async function createThread(
  thread: Thread,
  messages?: Message[],
): Promise<Thread> {
  const toolCaller = createToolCaller();
  const createToolName = "COLLECTION_THREADS_CREATE";
  const input = {
    data: {
      ...thread,
      messages,
    },
  };
  const result = (await toolCaller(
    createToolName,
    input,
  )) as CollectionInsertOutput<Thread>;
  return result.item;
}

async function updateThread(
  id: string,
  updates: Partial<Thread>,
): Promise<Thread> {
  const toolCaller = createToolCaller();
  const updateToolName = "COLLECTION_THREADS_UPDATE";
  const input = {
    id,
    data: updates,
  };
  const result = (await toolCaller(
    updateToolName,
    input,
  )) as CollectionUpdateOutput<Thread>;
  return result.item;
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
      if (!threadId) {
        return [];
      }
      const messages = await getThreadMessages(threadId);
      return messages;
    },
    staleTime: 30_000,
  });

  return data ?? [];
}

/**
 * Hook to get thread mutation actions (insert, update, delete)
 *
 * @returns Object with insert, update, and delete mutation hooks
 */
export function useThreadActions() {
  const { locator } = useProjectContext();
  const queryClient = useQueryClient();

  const insert = useMutation({
    mutationFn: async ({
      thread,
      messages,
    }: {
      thread: Thread;
      messages?: Message[];
    }) => {
      return await createThread(thread, messages);
    },
    onSuccess: (thread: Thread) => {
      // Invalidate all threads queries (including virtual MCP-filtered)
      queryClient.invalidateQueries({ queryKey: KEYS.threads(locator) });
      if (thread.virtualMcpId) {
        queryClient.invalidateQueries({
          queryKey: KEYS.virtualMcpThreads(locator, thread.virtualMcpId),
        });
      }
    },
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Thread>;
    }) => {
      return await updateThread(id, updates);
    },
    onSuccess: (updated: Thread) => {
      // Invalidate all threads queries (including virtual MCP-filtered)
      queryClient.invalidateQueries({ queryKey: KEYS.threads(locator) });
      queryClient.invalidateQueries({
        queryKey: KEYS.thread(locator, updated.id),
      });
      if (updated.virtualMcpId) {
        queryClient.invalidateQueries({
          queryKey: KEYS.virtualMcpThreads(locator, updated.virtualMcpId),
        });
      }
    },
  });

  return {
    insert,
    update,
  };
}

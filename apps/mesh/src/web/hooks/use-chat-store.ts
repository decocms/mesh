/**
 * Chat Store Hooks using React Query + IndexedDB
 *
 * Provides React hooks for working with threads and messages stored in IndexedDB.
 * Uses TanStack React Query for caching and mutations with idb-keyval for persistence.
 */

import { entries, get, set, del } from "idb-keyval";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { KEYS } from "../lib/query-keys";
import { useProjectContext } from "../providers/project-context-provider";
import type { Message, Thread } from "../types/chat-threads";

/**
 * Get a single thread by ID from IndexedDB
 */
export async function getThreadFromIndexedDB(
  locator: string,
  threadId: string,
): Promise<Thread | null> {
  const key = `${locator}:threads:${threadId}`;
  return (await get<Thread>(key)) ?? null;
}

/**
 * Get messages for a specific thread from IndexedDB
 */
function getThreadMessagesFromIndexedDB(
  locator: string,
  threadId: string,
): Promise<Message[]> {
  const prefix = `${locator}:messages:`;
  return entries().then((allEntries: [unknown, unknown][]) => {
    const messages = allEntries
      .filter(
        ([key]: [unknown, unknown]) =>
          typeof key === "string" && key.startsWith(prefix),
      )
      .map(([, value]: [unknown, unknown]) => value as Message)
      .filter(
        (msg: Message) =>
          msg.metadata?.thread_id === threadId ||
          (msg as unknown as { threadId?: string }).threadId === threadId,
      );

    // Sort by created_at
    return messages.sort((a: Message, b: Message) => {
      const aTime =
        a.metadata?.created_at ||
        (a as unknown as { createdAt?: string }).createdAt ||
        "";
      const bTime =
        b.metadata?.created_at ||
        (b as unknown as { createdAt?: string }).createdAt ||
        "";
      return String(aTime).localeCompare(String(bTime));
    });
  });
}

/**
 * Hook to get messages for a specific thread
 *
 * @param threadId - The ID of the thread
 * @returns Suspense query result with messages array
 */
export function useThreadMessages(threadId: string) {
  const { locator } = useProjectContext();

  const { data } = useSuspenseQuery({
    queryKey: KEYS.threadMessages(locator, threadId),
    queryFn: () => getThreadMessagesFromIndexedDB(locator, threadId),
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
    mutationFn: async (thread: Thread) => {
      const key = `${locator}:threads:${thread.id}`;
      await set(key, thread);
      return thread;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.threads(locator) });
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
      const key = `${locator}:threads:${id}`;
      const existing = await get<Thread>(key);
      if (!existing) {
        throw new Error(`Thread ${id} not found`);
      }
      const updated: Thread = { ...existing, ...updates };
      await set(key, updated);
      return updated;
    },
    onSuccess: (updated: Thread) => {
      queryClient.invalidateQueries({ queryKey: KEYS.threads(locator) });
      queryClient.invalidateQueries({
        queryKey: KEYS.thread(locator, updated.id),
      });
    },
  });

  const delete_ = useMutation({
    mutationFn: async (id: string) => {
      const key = `${locator}:threads:${id}`;
      await del(key);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.threads(locator) });
    },
  });

  return {
    insert,
    update,
    delete: delete_,
  };
}

/**
 * Hook to get message mutation actions (insert, update, delete)
 *
 * @returns Object with insert, update, and delete mutation hooks
 */
export function useMessageActions() {
  const { locator } = useProjectContext();
  const queryClient = useQueryClient();

  const insert = useMutation({
    mutationFn: async (message: Message) => {
      const key = `${locator}:messages:${message.id}`;
      await set(key, message);
      return message;
    },
    onSuccess: (message: Message) => {
      const threadId =
        message.metadata?.thread_id ||
        (message as unknown as { threadId?: string }).threadId;
      if (threadId) {
        queryClient.invalidateQueries({
          queryKey: KEYS.threadMessages(locator, threadId),
        });
      }
      queryClient.invalidateQueries({ queryKey: KEYS.messages(locator) });
    },
  });

  const insertMany = useMutation({
    mutationFn: async (messages: Message[]) => {
      await Promise.all(
        messages.map((message) => {
          const key = `${locator}:messages:${message.id}`;
          return set(key, message);
        }),
      );
      return messages;
    },
    onSuccess: (messages: Message[]) => {
      const threadIds = new Set<string>();
      for (const message of messages) {
        const threadId =
          message.metadata?.thread_id ||
          (message as unknown as { threadId?: string }).threadId;
        if (threadId) {
          threadIds.add(threadId);
        }
      }
      for (const threadId of threadIds) {
        queryClient.invalidateQueries({
          queryKey: KEYS.threadMessages(locator, threadId),
        });
      }
      queryClient.invalidateQueries({ queryKey: KEYS.messages(locator) });
    },
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Message>;
    }) => {
      const key = `${locator}:messages:${id}`;
      const existing = await get<Message>(key);
      if (!existing) {
        throw new Error(`Message ${id} not found`);
      }
      const updated: Message = { ...existing, ...updates };
      await set(key, updated);
      return updated;
    },
    onSuccess: (updated: Message) => {
      const threadId =
        updated.metadata?.thread_id ||
        (updated as unknown as { threadId?: string }).threadId;
      if (threadId) {
        queryClient.invalidateQueries({
          queryKey: KEYS.threadMessages(locator, threadId),
        });
      }
      queryClient.invalidateQueries({ queryKey: KEYS.messages(locator) });
    },
  });

  const delete_ = useMutation({
    mutationFn: async (id: string) => {
      const key = `${locator}:messages:${id}`;
      await del(key);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.messages(locator) });
    },
  });

  return {
    insert,
    insertMany,
    update,
    delete: delete_,
  };
}

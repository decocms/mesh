/**
 * Chat Store Hooks using React Query + Collection Tools
 *
 * Provides React hooks for working with threads and messages stored in the backend.
 * Uses TanStack React Query for caching and mutations with MCP collection tools for persistence.
 */

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { createToolCaller } from "../../tools/client";
import { KEYS } from "../lib/query-keys";
import { useProjectContext } from "../providers/project-context-provider";
import type { Message, Thread } from "../types/chat-threads";

// Tool caller for mesh management API (no connectionId = /mcp endpoint)
const meshToolCaller = createToolCaller();

// ============================================================================
// Types
// ============================================================================

/** Thread entity from backend */
interface ThreadEntity {
  id: string;
  organizationId: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string | null;
}

/** Thread message entity from backend */
interface ThreadMessageEntity {
  id: string;
  threadId: string;
  metadata?: Record<string, unknown>;
  parts: Array<Record<string, unknown>>;
  role: "user" | "assistant";
  createdAt: string;
  updatedAt: string;
}

/** Collection list output */
interface CollectionListOutput<T> {
  items: T[];
  totalCount: number;
  hasMore: boolean;
}

/** Collection insert output */
interface CollectionInsertOutput<T> {
  item: T;
}

/** Collection delete output */
interface CollectionDeleteOutput<T> {
  item: T;
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Convert backend ThreadEntity to frontend Thread type */
function toThread(entity: ThreadEntity): Thread {
  return {
    id: entity.id,
    title: entity.title,
    created_at: entity.createdAt,
    updated_at: entity.updatedAt,
    hidden: false,
    // Note: gatewayId is not stored in backend, would need to be added if needed
  };
}

/** Convert backend ThreadMessageEntity to frontend Message type */
function toMessage(entity: ThreadMessageEntity): Message {
  return {
    id: entity.id,
    role: entity.role,
    parts: entity.parts as Message["parts"],
    metadata: {
      ...entity.metadata,
      thread_id: entity.threadId,
      created_at: entity.createdAt,
    },
  } as Message;
}

// ============================================================================
// Thread Queries
// ============================================================================

/**
 * Get messages for a thread from backend
 *
 * @param _locator - Unused, kept for backward compatibility
 * @param threadId - The ID of the thread
 */
export async function getThreadMessages(
  _locator: string,
  threadId: string,
): Promise<Message[]> {
  const result = await meshToolCaller("COLLECTION_THREAD_MESSAGES_LIST", {
    threadId,
  });
  const output = result as CollectionListOutput<ThreadMessageEntity>;
  return output.items.map(toMessage);
}

export async function getThread(
  _locator: string,
  threadId: string,
): Promise<Thread> {
  const result = await meshToolCaller("COLLECTION_THREADS_GET", {
    id: threadId,
  });
  return toThread(result as ThreadEntity);
}

// ============================================================================
// React Hooks
// ============================================================================

/**
 * Hook to get all threads, optionally filtered by gateway
 *
 * @param options - Optional filter options
 * @returns Object with threads array and refetch function
 */
export function useThreads() {
  const { locator } = useProjectContext();

  const { data, refetch } = useSuspenseQuery({
    queryKey: KEYS.threads(locator),
    queryFn: async () => {
      const result = (await meshToolCaller("COLLECTION_THREADS_LIST", {
        orderBy: [{ field: ["updatedAt"], direction: "desc" }],
        limit: 100,
      })) as CollectionListOutput<ThreadEntity>;

      const threads = result.items.map(toThread);

      return threads;
    },
    staleTime: 30_000,
  });

  return { threads: data ?? [], refetch };
}

/**
 * Hook to get messages for a specific thread
 *
 * @param threadId - The ID of the thread
 * @param gatewayId - Optional gateway ID for query key scoping
 * @returns Suspense query result with messages array
 */
export function useThreadMessages(threadId: string | null) {
  const { locator } = useProjectContext();

  const { data } = useSuspenseQuery({
    queryKey: KEYS.threadMessages(locator, threadId ?? "new-chat"),
    queryFn: () => (threadId ? getThreadMessages(locator, threadId) : []),
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
      const result = (await meshToolCaller("COLLECTION_THREADS_CREATE", {
        data: {
          id: thread.id,
          title: thread.title,
          description: null,
        },
      })) as CollectionInsertOutput<ThreadEntity>;

      return toThread(result.item);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.threads(locator) });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to create thread: ${message}`);
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
      const result = (await meshToolCaller("COLLECTION_THREADS_UPDATE", {
        id,
        data: {
          title: updates.title,
          description: null,
        },
      })) as CollectionInsertOutput<ThreadEntity>;

      return toThread(result.item);
    },
    onSuccess: (updated: Thread) => {
      queryClient.invalidateQueries({ queryKey: KEYS.threads(locator) });
      queryClient.invalidateQueries({
        queryKey: KEYS.thread(locator, updated.id),
      });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to update thread: ${message}`);
    },
  });

  const delete_ = useMutation({
    mutationFn: async (id: string) => {
      const result = (await meshToolCaller("COLLECTION_THREADS_DELETE", {
        id,
      })) as CollectionDeleteOutput<ThreadEntity>;

      return result.item.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.threads(locator) });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to delete thread: ${message}`);
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
 * Note: Messages are created by the backend during chat streaming.
 * These mutations are primarily for local cache management.
 *
 * @param gatewayId - Optional gateway ID for query key scoping
 * @returns Object with insert, insertMany, update, and delete mutation hooks
 */
export function useMessageActions() {
  const { locator } = useProjectContext();
  const queryClient = useQueryClient();

  // Messages are managed by the backend, so we just invalidate queries
  // to refetch from the server

  const insert = useMutation({
    mutationFn: async (message: Message) => {
      // Messages are created server-side during streaming
      // This is just for cache invalidation
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
      // Messages are created server-side during streaming
      // This is just for cache invalidation
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
      // Return the updates for cache management
      return { id, ...updates } as Message;
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
      // Messages are managed server-side
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

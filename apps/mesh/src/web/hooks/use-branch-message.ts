/**
 * Branch Message Hook
 *
 * Provides functionality to branch from a specific message in a thread.
 * Queries IndexedDB directly for better performance and isolation.
 */

import { useProjectContext } from "../providers/project-context-provider";
import {
  getThreadMessagesFromIndexedDB,
  useMessageActions,
  useThreadActions,
} from "./use-chat-store";
import type { Message, Thread } from "../types/chat-threads";

/**
 * Hook to handle branching from a message
 *
 * @param onThreadChange - Callback to switch to the new thread
 * @returns Function to branch from a message
 */
export function useBranchMessage(
  onThreadChange: (newThreadId: string) => void,
) {
  const { locator } = useProjectContext();
  const messageActions = useMessageActions();
  const threadActions = useThreadActions();

  /**
   * Branch from a specific message - creates a new thread with messages
   * before the specified message
   *
   * @param messageId - The ID of the message to branch from
   * @param _messageText - The text of the message (for input population, handled by context)
   * @param currentThreadId - The current thread ID
   */
  const branchFromMessage = async (
    messageId: string,
    _messageText: string,
    currentThreadId: string,
  ): Promise<void> => {
    // Query messages directly from IndexedDB
    const allMessages = await getThreadMessagesFromIndexedDB(
      locator,
      currentThreadId,
    );

    // Find the index of the message to branch from
    const messageIndex = allMessages.findIndex(
      (m: Message) => m.id === messageId,
    );
    if (messageIndex === -1) {
      console.warn(
        `[branch] Message ${messageId} not found in thread ${currentThreadId}`,
      );
      return;
    }

    // Get messages to copy (before the clicked message, excluding system)
    const messagesToCopy = allMessages
      .slice(0, messageIndex)
      .filter((m: Message) => m.role !== "system");

    // Create a new thread ID
    const newThreadId = crypto.randomUUID();

    // Create the new thread (will be properly titled when first message is sent)
    const now = new Date().toISOString();
    const newThread: Thread = {
      id: newThreadId,
      title: "", // Will be set when first message completes
      created_at: now,
      updated_at: now,
      hidden: false,
    };

    // Insert the new thread
    await threadActions.insert.mutateAsync(newThread);

    // Copy messages to the new thread with new IDs and updated thread_id
    if (messagesToCopy.length > 0) {
      const copiedMessages = messagesToCopy.map((msg: Message) => ({
        ...msg,
        id: crypto.randomUUID(),
        metadata: {
          ...msg.metadata,
          thread_id: newThreadId,
          created_at: msg.metadata?.created_at || now,
        },
      }));

      // Insert copied messages into IndexedDB
      await messageActions.insertMany.mutateAsync(
        copiedMessages as unknown as Message[],
      );
    }

    // Switch to the new thread
    onThreadChange(newThreadId);
  };

  return branchFromMessage;
}

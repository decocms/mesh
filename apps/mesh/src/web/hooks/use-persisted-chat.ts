/**
 * Persisted Chat Hook
 *
 * Encapsulates the AI chat logic with IndexedDB persistence for threads and messages.
 * Used by both the agent chat panel and the side panel chat.
 */

import { useChat } from "@ai-sdk/react";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { useState } from "react";
import { DefaultChatTransport, type UIMessage } from "ai";
import type { ChatMessage } from "../components/chat/chat";
import { useProjectContext } from "../providers/project-context-provider";
import type { Message, Thread } from "../types/chat-threads";
import {
  getThreadFromIndexedDB,
  useMessageActions,
  useThreadActions,
  useThreadMessages,
} from "./use-chat-store";

const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

/**
 * Context for tracking a branch operation in progress
 */
export interface BranchContext {
  /** The original thread ID before branching */
  originalThreadId: string;
  /** The original message ID that was branched from */
  originalMessageId: string;
  /** The original message text for editing */
  originalMessageText: string;
}

const createModelsTransport = (
  org: string,
): DefaultChatTransport<UIMessage<Metadata>> =>
  new DefaultChatTransport<UIMessage<Metadata>>({
    api: `/api/${org}/models/stream`,
    credentials: "include",
    prepareSendMessagesRequest: ({ messages, requestMetadata }) => ({
      body: {
        messages,
        stream: true,
        ...(requestMetadata as Metadata | undefined),
      },
    }),
  });

/**
 * Options for the usePersistedChat hook
 */
export interface UsePersistedChatOptions {
  /** The active thread ID for the chat session */
  threadId: string;
  /** Optional system prompt to prepend. Not persisted. */
  systemPrompt?: string;
  /**
   * Called when a thread needs to be created (first message completion).
   * If not provided, uses internal thread actions.
   */
  onCreateThread?: (thread: { id: string; title: string }) => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
  /** Called when a tool is invoked during chat */
  onToolCall?: (event: { toolCall: { toolName: string } }) => void;
  /** Called when the active thread changes (for branching) */
  onThreadChange?: (newThreadId: string) => void;
}

/**
 * Return type for usePersistedChat hook
 */
export interface PersistedChatResult {
  /** Current chat messages */
  messages: ChatMessage[];
  /** Current chat status */
  status: "submitted" | "streaming" | "ready" | "error";
  /**
   * Send a text message with metadata.
   * Returns early if text is empty or chat is busy.
   */
  sendMessage: (text: string, metadata: Metadata) => Promise<void>;
  /** Stop the current streaming response */
  stop: () => void;
  /** Set messages directly (for reverting, clearing, etc.) */
  setMessages: (messages: ChatMessage[]) => void;
  /** Current branch context if branching is in progress */
  branchContext: BranchContext | null;
  /** Clear the branch context */
  clearBranchContext: () => void;
  /**
   * Branch from a specific message - creates a new thread with messages
   * before the specified message, and sets up input for editing.
   */
  branchFromMessage: (messageId: string, messageText: string) => Promise<void>;
}

/**
 * Hook that encapsulates AI chat with IndexedDB persistence.
 *
 * Handles:
 * - Transport creation for the org
 * - Loading persisted messages from IndexedDB
 * - Persisting new messages on completion
 * - Creating/updating thread titles
 *
 * @param options - Configuration options
 * @returns Chat state and actions
 */
export function usePersistedChat(
  options: UsePersistedChatOptions,
): PersistedChatResult {
  const {
    threadId,
    systemPrompt,
    onCreateThread,
    onError,
    onThreadChange,
    onToolCall,
  } = options;

  const {
    org: { slug: orgSlug },
    locator,
  } = useProjectContext();

  // Thread and message actions for persistence
  const threadActions = useThreadActions();
  const messageActions = useMessageActions();

  // State to track if we're editing from a branch (shows the original message preview)
  const [branchContext, setBranchContext] = useState<BranchContext | null>(
    null,
  );

  // Load persisted messages for this thread
  const persistedMessages = useThreadMessages(threadId) as unknown as Message[];

  // Use provided system prompt or default
  const effectiveSystemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;

  // Create system message (always defined)
  const systemMessage: ChatMessage = {
    id: "system",
    role: "system",
    parts: [{ type: "text", text: effectiveSystemPrompt }],
  };

  // Combine system message with persisted messages
  const allMessages = [systemMessage as Message, ...persistedMessages];

  // Derive chat id from thread id and system prompt for cache isolation
  const chatId = `${threadId}:${effectiveSystemPrompt}`;

  // Create transport for this org
  const transport = createModelsTransport(orgSlug);

  // Handle chat completion - persist messages and update thread
  const onFinish = async ({
    finishReason,
    messages,
    isAbort,
    isDisconnect,
    isError,
  }: {
    message: ChatMessage;
    messages: ChatMessage[];
    isAbort: boolean;
    isDisconnect: boolean;
    isError: boolean;
    finishReason?: string;
  }) => {
    if (finishReason !== "stop" || isAbort || isDisconnect || isError) return;

    const newMessages = messages.slice(-2).filter(Boolean) as Message[];
    if (newMessages.length !== 2) return;

    // Persist the new messages
    messageActions.insertMany.mutate(newMessages);

    // Extract title from first text part
    const msgTitle =
      newMessages
        .find((m) => m.parts?.find((part) => part.type === "text"))
        ?.parts?.find((part) => part.type === "text")
        ?.text.slice(0, 100) || "";

    // Check if thread exists
    const existingThread = await getThreadFromIndexedDB(locator, threadId);

    if (!existingThread) {
      // Create new thread
      if (onCreateThread) {
        onCreateThread({ id: threadId, title: msgTitle });
      } else {
        const now = new Date().toISOString();
        const newThread: Thread = {
          id: threadId,
          title: msgTitle,
          created_at: now,
          updated_at: now,
          hidden: false,
        };
        threadActions.insert.mutate(newThread);
      }
      return;
    }

    // Update existing thread
    threadActions.update.mutate({
      id: threadId,
      updates: {
        title: existingThread.title || msgTitle,
        updated_at: new Date().toISOString(),
      },
    });
  };

  // Initialize AI chat
  const chat = useChat<UIMessage<Metadata>>({
    id: chatId,
    messages: allMessages,
    transport,
    onFinish,
    onToolCall,
    onError: (error: Error) => {
      console.error("[chat] Chat error:", error);
      onError?.(error);
    },
  });

  // Send message helper
  const sendMessage = async (text: string, metadata: Metadata) => {
    if (
      !text?.trim() ||
      chat.status === "submitted" ||
      chat.status === "streaming"
    ) {
      return;
    }

    await chat.sendMessage(
      {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text }],
        metadata,
      },
      { metadata },
    );
  };

  // Branch from a specific message - creates a new thread with messages
  // before the specified message.
  const branchFromMessage = async (messageId: string, messageText: string) => {
    // Find the index of the message to branch from
    const messageIndex = chat.messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return;

    // Save the original thread context before switching
    const originalThreadId = threadId;

    // Get messages to copy (before the clicked message, excluding system)
    const messagesToCopy = chat.messages
      .slice(0, messageIndex)
      .filter((m) => m.role !== "system");

    // Create a new thread
    const newThreadId = crypto.randomUUID();

    // Copy messages to the new thread with new IDs and updated thread_id
    if (messagesToCopy.length > 0) {
      const copiedMessages = messagesToCopy.map((msg) => ({
        ...msg,
        id: crypto.randomUUID(),
        metadata: {
          ...msg.metadata,
          thread_id: newThreadId,
          created_at: msg.metadata?.created_at || new Date().toISOString(),
        },
      }));

      // Insert copied messages into IndexedDB
      await messageActions.insertMany.mutateAsync(
        copiedMessages as unknown as Message[],
      );
    }

    // Switch to the new thread
    onThreadChange?.(newThreadId);

    // Track the original context for the preview (allows navigating back)
    setBranchContext({
      originalThreadId,
      originalMessageId: messageId,
      originalMessageText: messageText,
    });
  };

  const clearBranchContext = () => setBranchContext(null);

  return {
    messages: chat.messages,
    status: chat.status,
    sendMessage,
    stop: chat.stop.bind(chat),
    setMessages: chat.setMessages,
    branchContext,
    clearBranchContext,
    branchFromMessage,
  };
}

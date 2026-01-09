/**
 * Persisted Chat Hook
 *
 * Encapsulates the AI chat logic with IndexedDB persistence for threads and messages.
 * Used by both the agent chat panel and the side panel chat.
 */

import { useChat } from "@ai-sdk/react";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useState } from "react";
import type { ChatMessage } from "../components/chat";
import { useProjectContext } from "../providers/project-context-provider";
import type { Message, Thread } from "../types/chat-threads";
import {
  getThreadFromIndexedDB,
  useMessageActions,
  useThreadActions,
  useThreadMessages,
} from "./use-chat-store";

const DEFAULT_SYSTEM_PROMPT = "You are a helpful assistant.";

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
  /** Whether the chat is empty (no user/assistant messages) */
  isEmpty: boolean;
  /** Current error if any */
  error: Error | undefined;
  /** Clear the current error */
  clearError: () => void;
  /** Finish reason for the last message completion */
  finishReason: string | null;
  /** Clear the finish reason */
  clearFinishReason: () => void;
}

/**
 * Hook that encapsulates AI chat with IndexedDB persistence.
 *
 * Handles:
 * - Transport creation for the org
 * - Loading persisted messages from IndexedDB
 * - Persisting new messages on completion
 * - Creating thread titles (only on thread creation, never updated)
 *
 * @param options - Configuration options
 * @returns Chat state and actions
 */
export function usePersistedChat(
  options: UsePersistedChatOptions,
): PersistedChatResult {
  const { threadId, systemPrompt, onCreateThread, onError, onToolCall } =
    options;

  const {
    org: { slug: orgSlug },
    locator,
  } = useProjectContext();

  // Thread and message actions for persistence
  const threadActions = useThreadActions();
  const messageActions = useMessageActions();

  // State for finish reason
  const [finishReason, setFinishReason] = useState<string | null>(null);

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
    // Store the finish reason in state (convert undefined to null)
    setFinishReason(finishReason ?? null);

    if (finishReason !== "stop" || isAbort || isDisconnect || isError) {
      return;
    }

    const newMessages = messages.slice(-2).filter(Boolean) as Message[];

    if (newMessages.length !== 2) {
      console.warn("[chat] Expected 2 messages, got", newMessages.length);
      return;
    }

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

    // Update existing thread (only update timestamp, never update title)
    threadActions.update.mutate({
      id: threadId,
      updates: {
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

    // Clear finish reason when sending new message
    setFinishReason(null);

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

  // Check if chat is empty (no user/assistant messages)
  const isEmpty =
    chat.messages[0]?.role === "system"
      ? chat.messages.length === 1
      : chat.messages.length === 0;

  return {
    messages: chat.messages,
    status: chat.status,
    sendMessage,
    stop: chat.stop.bind(chat),
    setMessages: chat.setMessages,
    isEmpty,
    error: chat.error,
    clearError: chat.clearError,
    finishReason,
    clearFinishReason: () => setFinishReason(null),
  };
}

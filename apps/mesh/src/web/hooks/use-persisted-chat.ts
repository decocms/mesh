/**
 * Persisted Chat Hook
 *
 * Encapsulates the AI chat logic with IndexedDB persistence for threads and messages.
 * Used by both the agent chat panel and the side panel chat.
 */

import { useChat } from "@ai-sdk/react";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useRef, useState } from "react";
import type { ChatMessage } from "../components/chat";
import { useProjectContext } from "../providers/project-context-provider";
import type { Message } from "../types/chat-threads";
import { useThreadMessages, useThreads } from "./use-chat-store";
import { useQueryClient } from "@tanstack/react-query";
import { KEYS } from "../lib/query-keys";

const createModelsTransport = (
  org: string,
  additionalContext?: Record<string, unknown>,
): DefaultChatTransport<UIMessage<Metadata>> =>
  new DefaultChatTransport<UIMessage<Metadata>>({
    api: `/api/${org}/decopilot/stream`,
    credentials: "include",
    prepareSendMessagesRequest: ({ messages, requestMetadata }) => ({
      body: {
        message: messages.slice(-1)[0],
        stream: true,
        additionalContext,
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
  /** Optional gateway ID to associate with the thread */
  gatewayId?: string;
  /**
   * Called when a thread needs to be created (first message completion).
   * If not provided, uses internal thread actions.
   */
  onCreateThread?: (thread: { id: string; title: string }) => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
  /** Called when a tool is invoked during chat */
  onToolCall?: (event: { toolCall: { toolName: string } }) => void;
  /** Set the active thread ID */
  setActiveThreadId: (threadId: string) => void;
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
  const { threadId, onError, onToolCall } = options;
  const client = useQueryClient();
  const { locator } = useProjectContext();
  const {
    org: { slug: orgSlug },
  } = useProjectContext();
  const { threads } = useThreads();

  // State for finish reason
  const [finishReason, setFinishReason] = useState<string | null>(null);

  // Load persisted messages for this thread
  const persistedMessages = useThreadMessages(threadId) as unknown as Message[];

  // Combine system message with persisted messages
  const allMessages = [...persistedMessages];

  // Create transport for this org
  const transport = createModelsTransport(orgSlug);

  const processedThreadSwitchRef = useRef<string | null>(null);

  // Handle chat completion - persist messages and update thread
  const onFinish = async ({
    finishReason,
    isAbort,
    isDisconnect,
    isError,
    message,
    messages,
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

    const newThreadId = message.metadata?.thread_id;
    client.setQueryData(
      KEYS.threadMessages(locator, newThreadId ?? threadId),
      messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        parts: msg.parts,
        metadata: {
          ...msg.metadata,
          thread_id: newThreadId,
        },
      })),
    );
    if (
      newThreadId &&
      newThreadId !== threadId &&
      processedThreadSwitchRef.current !== newThreadId
    ) {
      // Mark as processed to prevent double handling
      processedThreadSwitchRef.current = newThreadId;

      // Pre-populate the query cache with current messages before switching
      // This prevents suspense from triggering when the thread ID changes
      client.setQueryData(
        KEYS.threads(locator),
        threads.map((thread) => {
          if (thread.id === threadId) {
            return { ...thread, id: newThreadId };
          }
          return thread;
        }),
      );

      // Now switch the thread - data is already in cache, no suspend
      options.setActiveThreadId(newThreadId);
    }

    if (finishReason !== "stop" || isAbort || isDisconnect || isError) {
      return;
    }
  };

  // Initialize AI chat
  const chat = useChat<UIMessage<Metadata>>({
    id: threadId,
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

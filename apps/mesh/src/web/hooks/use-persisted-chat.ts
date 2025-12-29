/**
 * Persisted Chat Hook
 *
 * Encapsulates the AI chat logic with IndexedDB persistence for threads and messages.
 * Used by both the agent chat panel and the side panel chat.
 */

import { useChat as useAiChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import {
  getThreadFromIndexedDB,
  useMessageActions,
  useThreadActions,
  useThreadMessages,
} from "./use-chat-store";
import { useProjectContext } from "../providers/project-context-provider";
import type { Message, Thread } from "../types/chat-threads";
import type { ChatMessage } from "../components/chat/chat";

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
  const { threadId, systemPrompt, onCreateThread, onError } = options;

  const {
    org: { slug: orgSlug },
    locator,
  } = useProjectContext();

  // Thread and message actions for persistence
  const threadActions = useThreadActions();
  const messageActions = useMessageActions();

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
  const chat = useAiChat<UIMessage<Metadata>>({
    id: chatId,
    messages: allMessages,
    transport,
    onFinish,
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

  return {
    messages: chat.messages,
    status: chat.status,
    sendMessage,
    stop: chat.stop.bind(chat),
  };
}

import { useChat as useAiChat } from "@ai-sdk/react";
import { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  createContext,
  PropsWithChildren,
  useContext,
  useRef,
  type RefObject,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useMessageActions,
  useThreadActions,
  useThreadMessages,
} from "../hooks/use-chat-store";
import { useLocalStorage } from "../hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "../lib/localstorage-keys";
import type { Message, Thread } from "../types/chat-threads";
import { useProjectContext } from "./project-context-provider";

// Create transport for models stream API (stable across model changes)
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

export interface ChatContextValue {
  // Thread management
  activeThreadId: string;
  createThread: (thread?: Partial<Thread>) => Thread;
  setActiveThreadId: (threadId: string) => void;
  hideThread: (threadId: string) => void;

  // Messages
  messages: Message[];

  // Chat State
  chat: ReturnType<typeof useAiChat>;
  sentinelRef: RefObject<HTMLDivElement>;

  // Selection State
  selectedModelState: { id: string; connectionId: string } | null;
  setSelectedModelState: (
    state: { id: string; connectionId: string } | null,
  ) => void;
  selectedAgentState: { agentId: string; connectionId: string } | null;
  setSelectedAgentState: (
    state: { agentId: string; connectionId: string } | null,
  ) => void;
}

const createThreadId = () => crypto.randomUUID();

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: PropsWithChildren) {
  const { locator, org } = useProjectContext();
  const queryClient = useQueryClient();

  // Get mutation actions
  const threadActions = useThreadActions();
  const messageActions = useMessageActions();

  // Active Thread ID State
  const [activeThreadId, setActiveThreadId] = useLocalStorage<string>(
    LOCALSTORAGE_KEYS.threadManagerState(locator) + ":active-id", // Modified key to avoid conflict/mess with old state
    (existing) => existing || createThreadId(),
  );

  // Messages for active thread
  const messages = useThreadMessages(activeThreadId);

  // Actions
  const createThread = (thread?: Partial<Thread>) => {
    const id = thread?.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const newThread: Thread = {
      id,
      title: thread?.title || "",
      created_at: thread?.created_at || now,
      updated_at: thread?.updated_at || now,
      hidden: thread?.hidden ?? false,
    };
    threadActions.insert.mutate(newThread);

    setActiveThreadId(id);
    return newThread;
  };

  // Consolidated hide/delete
  const hideThread = (threadId: string) => {
    threadActions.update.mutate({
      id: threadId,
      updates: {
        hidden: true,
        updated_at: new Date().toISOString(),
      },
    });

    // If hiding active thread, clear selection
    if (activeThreadId === threadId) {
      setActiveThreadId(createThreadId());
    }
  };

  // Persist selected model (including connectionId) per organization in localStorage
  const [selectedModelState, setSelectedModelState] = useLocalStorage<{
    id: string;
    connectionId: string;
  } | null>(
    LOCALSTORAGE_KEYS.chatSelectedModel(locator),
    (existing) => existing ?? null,
  );

  // Persist selected agent per organization in localStorage
  const [selectedAgentState, setSelectedAgentState] = useLocalStorage<{
    agentId: string;
    connectionId: string;
  } | null>(`${locator}:selected-agent`, () => null);

  // Sentinel ref for auto-scrolling to bottom
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Create transport (stable, doesn't depend on selected model)
  const transport = createModelsTransport(org.slug);

  // Use AI SDK's useChat hook
  const chat = useAiChat({
    id: activeThreadId,
    messages: messages,
    transport: transport,
    onFinish: (result) => {
      const { finishReason, messages, isAbort, isDisconnect, isError } = result;

      if (finishReason !== "stop" || isAbort || isDisconnect || isError) {
        return;
      }

      // Grab the last 2 messages, one for user another for assistant
      const newMessages = messages.slice(-2).filter(Boolean) as Message[];

      if (newMessages.length === 2) {
        // 1. Insert all messages at once (batch insertion)
        messageActions.insertMany.mutate(newMessages);

        const title =
          newMessages
            .find((m) => m.parts?.find((part) => part.type === "text"))
            ?.parts?.find((part) => part.type === "text")
            ?.text.slice(0, 100) || "";

        // Check if thread exists in cache
        const existingThread = queryClient.getQueryData<Thread | null>([
          "thread",
          locator,
          activeThreadId,
        ]);

        if (!existingThread) {
          createThread({ id: activeThreadId, title });
        } else {
          threadActions.update.mutate({
            id: activeThreadId,
            updates: {
              title: existingThread.title || title,
              updated_at: new Date().toISOString(),
            },
          });
        }
      }
    },
    onError: (error: Error) => {
      console.error("[deco-chat] Chat error:", error);
    },
  });

  const value = {
    activeThreadId,
    createThread,
    setActiveThreadId,
    hideThread,
    messages,
    chat: chat as unknown as ReturnType<typeof useAiChat>,
    sentinelRef: sentinelRef as RefObject<HTMLDivElement>,
    selectedModelState,
    setSelectedModelState,
    selectedAgentState,
    setSelectedAgentState,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}

/**
 * Chat Context
 *
 * Manages chat interaction, thread management, gateway/model selection, and chat session state.
 * Provides optimized state management to minimize re-renders across the component tree.
 */

import { useChat as useAIChat } from "@ai-sdk/react";
import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  createContext,
  useContext,
  useReducer,
  type PropsWithChildren,
} from "react";
import { toast } from "sonner";
import { useModelConnections } from "../../hooks/collections/use-llm";
import {
  getThread,
  useMessageActions,
  useThreadActions,
  useThreadMessages,
  useThreads,
} from "../../hooks/use-chat-store";
import { useContext as useContextHook } from "../../hooks/use-context";
import { useInvalidateCollectionsOnToolCall } from "../../hooks/use-invalidate-collections-on-tool-call";
import { useLocalStorage } from "../../hooks/use-local-storage";
import { authClient } from "../../lib/auth-client";
import { LOCALSTORAGE_KEYS } from "../../lib/localstorage-keys";
import type { ProjectLocator } from "../../lib/locator";
import { useProjectContext } from "../../providers/project-context-provider";
import type { Message, Thread } from "../../types/chat-threads";
import type { ChatMessage } from "./index";
import type { GatewayInfo } from "./select-gateway";
import { useGateways } from "./select-gateway";
import {
  useModels,
  type ModelChangePayload,
  type SelectedModelState,
} from "./select-model";

const createModelsTransport = (
  org: string,
): DefaultChatTransport<UIMessage<Metadata>> =>
  new DefaultChatTransport<UIMessage<Metadata>>({
    api: `/api/${org}/models/stream`,
    credentials: "include",
    prepareSendMessagesRequest: ({ messages, requestMetadata = {} }) => {
      const { system, ...metadata } = requestMetadata as Metadata;
      const systemMessage: UIMessage<Metadata> | null = system
        ? {
            id: crypto.randomUUID(),
            role: "system",
            parts: [{ type: "text", text: system }],
          }
        : null;

      return {
        body: {
          messages: systemMessage ? [systemMessage, ...messages] : messages,
          stream: true,
          ...metadata,
        },
      };
    },
  });

/**
 * Find an item by id in an array, or return the first item, or null
 */
const findOrFirst = <T extends { id: string }>(array?: T[], id?: string) =>
  array?.find((item) => item.id === id) ?? array?.[0] ?? null;

/**
 * Hook to manage model selection state with connection validation
 */
const useModelState = (
  locator: ProjectLocator,
  modelsConnections: ReturnType<typeof useModelConnections>,
) => {
  const [modelState, setModelState] = useLocalStorage<{
    id: string;
    connectionId: string;
  } | null>(LOCALSTORAGE_KEYS.chatSelectedModel(locator), null);

  // Determine connectionId to use (from stored selection or first available)
  const modelsConnection = findOrFirst(
    modelsConnections,
    modelState?.connectionId,
  );

  // Fetch models for the selected connection
  const models = useModels(modelsConnection?.id ?? null);

  // Find the selected model from the fetched models using stored state
  const selectedModel = findOrFirst(models, modelState?.id);

  const selectedModelState =
    selectedModel && modelsConnection?.id
      ? {
          id: selectedModel.id,
          provider: selectedModel.provider,
          limits: selectedModel.limits,
          connectionId: modelsConnection.id,
        }
      : null;

  return [selectedModelState, setModelState] as const;
};

/**
 * Branch context for tracking message editing flow
 */
export interface BranchContext {
  /** The original thread ID before branching */
  originalThreadId: string;
  /** The original message ID that was branched from */
  originalMessageId: string;
  /** The original message text for editing */
  originalMessageText: string;
}

/**
 * State shape for chat state (reducer-managed)
 */
export interface ChatState {
  /** Current value in the chat input field */
  inputValue: string;
  /** Active branch context if branching is in progress */
  branchContext: BranchContext | null;
  /** Finish reason from the last chat completion */
  finishReason: string | null;
}

/**
 * Actions for the chat state reducer
 */
export type ChatStateAction =
  | { type: "SET_INPUT"; payload: string }
  | { type: "START_BRANCH"; payload: BranchContext }
  | { type: "CLEAR_BRANCH" }
  | { type: "SET_FINISH_REASON"; payload: string | null }
  | { type: "CLEAR_FINISH_REASON" }
  | { type: "RESET" };

/**
 * Initial chat state
 */
const initialChatState: ChatState = {
  inputValue: "",
  branchContext: null,
  finishReason: null,
};

/**
 * Reducer for chat state
 */
function chatStateReducer(
  state: ChatState,
  action: ChatStateAction,
): ChatState {
  switch (action.type) {
    case "SET_INPUT":
      return { ...state, inputValue: action.payload };
    case "START_BRANCH":
      return { ...state, branchContext: action.payload };
    case "CLEAR_BRANCH":
      return { ...state, branchContext: null };
    case "SET_FINISH_REASON":
      return { ...state, finishReason: action.payload };
    case "CLEAR_FINISH_REASON":
      return { ...state, finishReason: null };
    case "RESET":
      return initialChatState;
    default:
      return state;
  }
}

/**
 * Combined context value including interaction state, thread management, and session state
 */
interface ChatContextValue {
  // Interaction state
  inputValue: string;
  branchContext: BranchContext | null;
  setInputValue: (value: string) => void;
  startBranch: (branchContext: BranchContext) => void;
  clearBranch: () => void;
  resetInteraction: () => void;

  // Thread management
  activeThreadId: string;
  activeThread: Thread | null;
  threads: Thread[];
  createThread: (thread?: Partial<Thread>) => Thread;
  setActiveThreadId: (threadId: string) => void;
  hideThread: (threadId: string) => void;

  // Gateway state
  gateways: GatewayInfo[];
  selectedGateway: GatewayInfo | null;
  setGatewayId: (gatewayId: string | null) => void;

  // Model state
  modelsConnections: ReturnType<typeof useModelConnections>;
  selectedModel: SelectedModelState | null;
  setSelectedModel: (model: ModelChangePayload) => void;

  // Chat state
  messages: ChatMessage[];
  chatStatus: "submitted" | "streaming" | "ready" | "error";
  isStreaming: boolean;
  isChatEmpty: boolean;
  sendMessage: (text: string) => Promise<void>;
  stopStreaming: () => void;
  setMessages: (messages: ChatMessage[]) => void;
  chatError: Error | undefined;
  clearChatError: () => void;
  finishReason: string | null;
  clearFinishReason: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const createThreadId = () => crypto.randomUUID();

/**
 * Provider component for chat context
 * Consolidates all chat-related state: interaction, threads, gateway, model, and chat session
 */
export function ChatProvider({ children }: PropsWithChildren) {
  // ===========================================================================
  // 1. HOOKS - Call all hooks and derive state from them
  // ===========================================================================

  // Project context
  const { locator, org } = useProjectContext();

  // User session
  const { data: session } = authClient.useSession();
  const user = session?.user ?? null;

  // Chat state (reducer-based)
  const [chatState, chatDispatch] = useReducer(
    chatStateReducer,
    initialChatState,
  );

  // Thread state
  const threadActions = useThreadActions();
  const messageActions = useMessageActions();
  const { threads } = useThreads();
  const [activeThreadId, setActiveThreadId] = useLocalStorage<string>(
    LOCALSTORAGE_KEYS.threadManagerState(locator) + ":active-id",
    (existing) => existing || createThreadId(),
  );
  const persistedMessages = useThreadMessages(activeThreadId);

  // Gateway state
  const gateways = useGateways();
  const [storedSelectedGatewayId, setSelectedGatewayId] = useLocalStorage<
    string | null
  >(`${locator}:selected-gateway-id`, null);

  // Model state
  const modelsConnections = useModelConnections();
  const [selectedModel, setModel] = useModelState(locator, modelsConnections);

  // Context prompt
  const contextPrompt = useContextHook(storedSelectedGatewayId);

  // Tool call handler
  const onToolCall = useInvalidateCollectionsOnToolCall();

  // ===========================================================================
  // 2. DERIVED VALUES - Compute values from hook state
  // ===========================================================================

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  const selectedGateway = storedSelectedGatewayId
    ? (gateways.find((g) => g.id === storedSelectedGatewayId) ?? null)
    : null;

  const transport = createModelsTransport(org.slug);

  // ===========================================================================
  // 3. HOOK CALLBACKS - Functions passed to hooks
  // ===========================================================================

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
    chatDispatch({ type: "SET_FINISH_REASON", payload: finishReason ?? null });

    if (finishReason !== "stop" || isAbort || isDisconnect || isError) {
      return;
    }

    const newMessages = messages.slice(-2).filter(Boolean) as Message[];

    if (newMessages.length !== 2) {
      console.warn("[chat] Expected 2 messages, got", newMessages.length);
      return;
    }

    messageActions.insertMany.mutate(newMessages);

    const msgTitle =
      newMessages
        .find((m) => m.parts?.find((part) => part.type === "text"))
        ?.parts?.find((part) => part.type === "text")
        ?.text.slice(0, 100) || "";

    const existingThread = await getThread(locator, activeThreadId);

    if (!existingThread) {
      const now = new Date().toISOString();
      const newThread: Thread = {
        id: activeThreadId,
        title: msgTitle,
        created_at: now,
        updated_at: now,
        hidden: false,
        gatewayId: selectedGateway?.id,
      };
      threadActions.insert.mutate(newThread);
      return;
    }

    threadActions.update.mutate({
      id: activeThreadId,
      updates: {
        title: existingThread.title || msgTitle,
        gatewayId: existingThread.gatewayId || selectedGateway?.id,
        updated_at: new Date().toISOString(),
      },
    });
  };

  const onError = (error: Error) => {
    console.error("[chat] Chat error:", error);
  };

  // ===========================================================================
  // 4. HOOKS USING CALLBACKS - Hooks that depend on callback functions
  // ===========================================================================

  const chat = useAIChat<UIMessage<Metadata>>({
    id: activeThreadId,
    messages: persistedMessages,
    transport,
    onFinish,
    onToolCall,
    onError,
  });

  // ===========================================================================
  // 5. POST-HOOK DERIVED VALUES - Values derived from hooks with callbacks
  // ===========================================================================

  const isStreaming =
    chat.status === "submitted" || chat.status === "streaming";

  const isChatEmpty = chat.messages.length === 0;

  // ===========================================================================
  // 6. RETURNED FUNCTIONS - Functions exposed via context
  // ===========================================================================

  // Chat state functions
  const setInputValue = (value: string) =>
    chatDispatch({ type: "SET_INPUT", payload: value });

  const startBranch = (branchCtx: BranchContext) =>
    chatDispatch({ type: "START_BRANCH", payload: branchCtx });

  const clearBranch = () => chatDispatch({ type: "CLEAR_BRANCH" });

  const resetInteraction = () => chatDispatch({ type: "RESET" });

  // Thread functions
  const createThread = (thread?: Partial<Thread>) => {
    const id = thread?.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const newThread: Thread = {
      id,
      title: thread?.title || "",
      created_at: thread?.created_at || now,
      updated_at: thread?.updated_at || now,
      hidden: thread?.hidden ?? false,
      gatewayId: thread?.gatewayId,
    };
    threadActions.insert.mutate(newThread);
    setActiveThreadId(id);
    return newThread;
  };

  const hideThread = (threadId: string) => {
    threadActions.update.mutate({
      id: threadId,
      updates: {
        hidden: true,
        updated_at: new Date().toISOString(),
      },
    });

    if (activeThreadId === threadId) {
      setActiveThreadId(createThreadId());
    }
  };

  // Gateway functions
  const setGatewayId = (gatewayId: string | null) => {
    setSelectedGatewayId(gatewayId);
  };

  // Model functions
  const setSelectedModel = (model: ModelChangePayload) => {
    setModel({ id: model.id, connectionId: model.connectionId });
  };

  // Chat functions
  const sendMessage = async (text: string) => {
    if (!selectedModel) {
      toast.error("No model configured");
      return;
    }

    if (!text?.trim() || isStreaming) {
      return;
    }

    setInputValue("");
    clearBranch();
    chatDispatch({ type: "CLEAR_FINISH_REASON" });

    const metadata: Metadata = {
      created_at: new Date().toISOString(),
      thread_id: activeThreadId,
      system: contextPrompt,
      model: {
        id: selectedModel.id,
        connectionId: selectedModel.connectionId,
        provider: selectedModel.provider ?? undefined,
        limits: selectedModel.limits ?? undefined,
      },
      gateway: { id: selectedGateway?.id ?? null },
      user: {
        avatar: user?.image ?? undefined,
        name: user?.name ?? "you",
      },
    };

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

  const stopStreaming = () => chat.stop();

  const clearFinishReason = () => chatDispatch({ type: "CLEAR_FINISH_REASON" });

  // ===========================================================================
  // 7. CONTEXT VALUE & RETURN
  // ===========================================================================

  const value: ChatContextValue = {
    // Chat state
    inputValue: chatState.inputValue,
    branchContext: chatState.branchContext,
    setInputValue,
    startBranch,
    clearBranch,
    resetInteraction,

    // Thread management
    activeThreadId,
    activeThread,
    threads,
    createThread,
    setActiveThreadId,
    hideThread,

    // Gateway state
    gateways,
    selectedGateway,
    setGatewayId,

    // Model state
    modelsConnections,
    selectedModel,
    setSelectedModel,

    // Chat session state
    messages: chat.messages,
    chatStatus: chat.status,
    isStreaming,
    isChatEmpty,
    sendMessage,
    stopStreaming,
    setMessages: chat.setMessages,
    chatError: chat.error,
    clearChatError: chat.clearError,
    finishReason: chatState.finishReason,
    clearFinishReason,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

/**
 * Hook to access the full chat context
 * Returns interaction state, thread management, gateway, model, and chat session state
 */
export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}

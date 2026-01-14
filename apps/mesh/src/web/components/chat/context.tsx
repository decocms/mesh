/**
 * Chat Context
 *
 * Manages chat interaction, thread management, gateway/model selection, and chat session state.
 * Provides optimized state management to minimize re-renders across the component tree.
 */

import type { Metadata } from "@deco/ui/types/chat-metadata.ts";
import {
  createContext,
  useContext,
  useReducer,
  type Dispatch,
  type PropsWithChildren,
} from "react";
import { toast } from "sonner";
import { useModelConnections } from "../../hooks/collections/use-llm";
import { useThreadActions, useThreads } from "../../hooks/use-chat-store";
import { useContext as useContextHook } from "../../hooks/use-context";
import { useInvalidateCollectionsOnToolCall } from "../../hooks/use-invalidate-collections-on-tool-call";
import { useLocalStorage } from "../../hooks/use-local-storage";
import { useModelState } from "../../hooks/use-model-state";
import type { PersistedChatResult } from "../../hooks/use-persisted-chat";
import { usePersistedChat } from "../../hooks/use-persisted-chat";
import { authClient } from "../../lib/auth-client";
import { LOCALSTORAGE_KEYS } from "../../lib/localstorage-keys";
import { useProjectContext } from "../../providers/project-context-provider";
import type { Thread } from "../../types/chat-threads";
import type { GatewayInfo } from "./select-gateway";
import { useGateways } from "./select-gateway";
import type { ModelChangePayload, SelectedModelState } from "./select-model";

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
 * State shape for chat interaction (reducer-managed)
 */
export interface ChatInteractionState {
  /** Current value in the chat input field */
  inputValue: string;
  /** Active branch context if branching is in progress */
  branchContext: BranchContext | null;
  /** Whether there's a pending message submit */
  pendingSubmit: boolean;
}

/**
 * Actions for the chat interaction reducer
 */
export type ChatInteractionAction =
  | { type: "SET_INPUT"; payload: string }
  | { type: "START_BRANCH"; payload: BranchContext }
  | { type: "CLEAR_BRANCH" }
  | { type: "SET_PENDING_SUBMIT"; payload: boolean }
  | { type: "RESET" };

/**
 * Initial state for interaction
 */
const initialInteractionState: ChatInteractionState = {
  inputValue: "",
  branchContext: null,
  pendingSubmit: false,
};

/**
 * Reducer for chat interaction state
 */
function chatInteractionReducer(
  state: ChatInteractionState,
  action: ChatInteractionAction,
): ChatInteractionState {
  switch (action.type) {
    case "SET_INPUT":
      return { ...state, inputValue: action.payload };
    case "START_BRANCH":
      return { ...state, branchContext: action.payload };
    case "CLEAR_BRANCH":
      return { ...state, branchContext: null };
    case "SET_PENDING_SUBMIT":
      return { ...state, pendingSubmit: action.payload };
    case "RESET":
      return initialInteractionState;
    default:
      return state;
  }
}

type User = NonNullable<
  ReturnType<typeof authClient.useSession>["data"]
>["user"];

/**
 * Combined context value including interaction state, thread management, and session state
 */
interface ChatContextValue {
  // Interaction state (from reducer)
  interactionState: ChatInteractionState;
  interactionDispatch: Dispatch<ChatInteractionAction>;

  // Thread management
  activeThreadId: string;
  createThread: (thread?: Partial<Thread>) => Thread;
  setActiveThreadId: (threadId: string) => void;
  hideThread: (threadId: string) => void;
  threads: Thread[];
  activeThread: Thread | null;

  // Gateway state
  selectedGateway: GatewayInfo | null;
  selectedGatewayId: string | null;
  gateways: GatewayInfo[];
  handleGatewayChange: (gatewayId: string | null) => void;

  // Model state
  selectedModel: SelectedModelState | null;
  handleModelChange: (model: ModelChangePayload) => void;
  modelsConnections: ReturnType<typeof useModelConnections>;
  hasModelsBinding: boolean;

  // Chat state
  chat: PersistedChatResult;
  isStreaming: boolean;
  handleSendMessage: (text: string) => Promise<void>;

  // Context and user
  contextPrompt: string;
  user: User | null;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const createThreadId = () => crypto.randomUUID();

/**
 * Provider component for chat context
 * Consolidates all chat-related state: interaction, threads, gateway, model, and chat session
 */
export function ChatProvider({ children }: PropsWithChildren) {
  const { locator } = useProjectContext();
  const { data: session } = authClient.useSession();
  const user = session?.user ?? null;

  // Interaction state (reducer-based)
  const [interactionState, interactionDispatch] = useReducer(
    chatInteractionReducer,
    initialInteractionState,
  );

  // Thread management (hooks-based)
  const threadActions = useThreadActions();
  const { threads } = useThreads();

  const [activeThreadId, setActiveThreadId] = useLocalStorage<string>(
    LOCALSTORAGE_KEYS.threadManagerState(locator) + ":active-id",
    (existing) => existing || createThreadId(),
  );

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

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

    // If hiding active thread, clear selection
    if (activeThreadId === threadId) {
      setActiveThreadId(createThreadId());
    }
  };

  // Gateway state
  const gateways = useGateways();
  const [storedSelectedGatewayId, setSelectedGatewayId] = useLocalStorage<
    string | null
  >(`${locator}:selected-gateway-id`, null);

  const selectedGateway = storedSelectedGatewayId
    ? (gateways.find((g) => g.id === storedSelectedGatewayId) ?? null)
    : null;

  const selectedGatewayId = selectedGateway?.id ?? null;

  const handleGatewayChange = (gatewayId: string | null) => {
    setSelectedGatewayId(gatewayId);
  };

  // Model state
  const modelsConnections = useModelConnections();
  const hasModelsBinding = Boolean(modelsConnections.length > 0);
  const [selectedModel, setModel] = useModelState(locator, modelsConnections);

  const handleModelChange = (model: ModelChangePayload) => {
    setModel({ id: model.id, connectionId: model.connectionId });
  };

  // Context prompt
  const contextPrompt = useContextHook(selectedGatewayId);

  // Chat state
  const onToolCall = useInvalidateCollectionsOnToolCall();
  const chat = usePersistedChat({
    threadId: activeThreadId,
    systemPrompt: contextPrompt,
    onToolCall,
    gatewayId: selectedGatewayId ?? undefined,
  });

  const isStreaming =
    chat.status === "submitted" || chat.status === "streaming";

  // Send message helper
  const handleSendMessage = async (text: string) => {
    if (!selectedModel) {
      toast.error("No model configured");
      return;
    }

    // Clear input
    interactionDispatch({ type: "SET_INPUT", payload: "" });

    // Clear editing state before sending
    interactionDispatch({ type: "CLEAR_BRANCH" });

    const metadata: Metadata = {
      created_at: new Date().toISOString(),
      thread_id: activeThreadId,
      model: {
        id: selectedModel.id,
        connectionId: selectedModel.connectionId,
        provider: selectedModel.provider ?? undefined,
        limits: selectedModel.limits ?? undefined,
      },
      gateway: { id: selectedGatewayId },
      user: {
        avatar: user?.image ?? undefined,
        name: user?.name ?? "you",
      },
    };

    await chat.sendMessage(text, metadata);
  };

  const value: ChatContextValue = {
    // Interaction state
    interactionState,
    interactionDispatch,

    // Thread management
    activeThreadId,
    createThread,
    setActiveThreadId,
    hideThread,
    threads,
    activeThread,

    // Gateway state
    selectedGateway,
    selectedGatewayId,
    gateways,
    handleGatewayChange,

    // Model state
    selectedModel,
    handleModelChange,
    modelsConnections,
    hasModelsBinding,

    // Chat state
    chat,
    isStreaming,
    handleSendMessage,

    // Context and user
    contextPrompt,
    user,
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

  const { interactionState, interactionDispatch } = context;

  return {
    // Interaction state
    inputValue: interactionState.inputValue,
    branchContext: interactionState.branchContext,
    pendingSubmit: interactionState.pendingSubmit,

    // Interaction actions
    setInputValue: (value: string) =>
      interactionDispatch({ type: "SET_INPUT", payload: value }),
    startBranch: (branchContext: BranchContext) =>
      interactionDispatch({ type: "START_BRANCH", payload: branchContext }),
    clearBranch: () => interactionDispatch({ type: "CLEAR_BRANCH" }),
    setPendingSubmit: (pending: boolean) =>
      interactionDispatch({ type: "SET_PENDING_SUBMIT", payload: pending }),
    reset: () => interactionDispatch({ type: "RESET" }),

    // Thread management
    activeThreadId: context.activeThreadId,
    createThread: context.createThread,
    setActiveThreadId: context.setActiveThreadId,
    hideThread: context.hideThread,
    threads: context.threads,
    activeThread: context.activeThread,

    // Gateway state
    selectedGateway: context.selectedGateway,
    selectedGatewayId: context.selectedGatewayId,
    gateways: context.gateways,
    handleGatewayChange: context.handleGatewayChange,

    // Model state
    selectedModel: context.selectedModel,
    handleModelChange: context.handleModelChange,
    modelsConnections: context.modelsConnections,
    hasModelsBinding: context.hasModelsBinding,

    // Chat state
    chat: context.chat,
    isStreaming: context.isStreaming,
    handleSendMessage: context.handleSendMessage,

    // Context and user
    contextPrompt: context.contextPrompt,
    user: context.user,
  };
}

/**
 * @deprecated Use useChat instead. This is kept for backward compatibility.
 */
export const useChatSession = useChat;

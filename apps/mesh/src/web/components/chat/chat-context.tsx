/**
 * Chat Context
 *
 * Manages both chat interaction (input, branching) and thread management (active thread, create/hide).
 * Provides optimized state management to minimize re-renders across the component tree.
 */

import {
  createContext,
  useContext,
  useReducer,
  type PropsWithChildren,
  type Dispatch,
} from "react";
import { useThreadActions } from "../../hooks/use-chat-store";
import { useProjectContext } from "../../providers/project-context-provider";
import type { Thread } from "../../types/chat-threads";
import { useQueryClient } from "@tanstack/react-query";
import { KEYS } from "../../lib/query-keys";
import { useSelectedGatewayId } from "./side-panel-chat";
import { useSelectedThreadId, useThreadsStoreActions } from "./threads-store";

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

/**
 * Combined context value including both interaction state and thread management
 */
interface ChatContextValue {
  // Interaction state (from reducer)
  interactionState: ChatInteractionState;
  interactionDispatch: Dispatch<ChatInteractionAction>;

  // Thread management
  activeThreadId: string | null;
  createThread: (thread?: Partial<Thread>) => Promise<Thread>;
  setActiveThreadId: (threadId: string) => void;
  hideThread: (threadId: string) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

/**
 * Provider component for chat context
 */
export function ChatProvider({ children }: PropsWithChildren) {
  const { locator } = useProjectContext();
  const queryClient = useQueryClient();
  const selectedGatewayId = useSelectedGatewayId();
  const selectedThreadId = useSelectedThreadId();
  const { setSelectedThreadId, deleteThread, addThread } =
    useThreadsStoreActions();
  // Interaction state (reducer-based)
  const [interactionState, interactionDispatch] = useReducer(
    chatInteractionReducer,
    initialInteractionState,
  );

  // Thread management (hooks-based)
  const threadActions = useThreadActions();

  const createThread = async (thread?: Partial<Thread>) => {
    const id = thread?.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const newThread: Thread = {
      id,
      title: thread?.title || "",
      created_at: thread?.created_at || now,
      updated_at: thread?.updated_at || now,
      hidden: thread?.hidden ?? false,
      gatewayId: selectedGatewayId ?? undefined,
    };
    const result = await threadActions.insert.mutateAsync(newThread);

    queryClient.invalidateQueries({ queryKey: KEYS.threads(locator) });
    addThread(result);
    setSelectedThreadId(result.id);
    return result;
  };

  const hideThread = (threadId: string) => {
    threadActions.delete.mutate(threadId);

    // If hiding active thread, clear selection
    deleteThread(threadId);
    if (selectedThreadId === threadId) {
      setSelectedThreadId(null);
    }
  };

  const value: ChatContextValue = {
    interactionState,
    interactionDispatch,
    activeThreadId: selectedThreadId,
    createThread,
    setActiveThreadId: setSelectedThreadId,
    hideThread,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

/**
 * Hook to access the chat context
 * Returns both interaction state and thread management functions
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
  };
}

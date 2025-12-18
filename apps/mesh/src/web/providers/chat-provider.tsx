import {
  createContext,
  PropsWithChildren,
  useContext,
} from "react";
import { useThreadActions } from "../hooks/use-chat-store";
import { useLocalStorage } from "../hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "../lib/localstorage-keys";
import type { Thread } from "../types/chat-threads";
import { useProjectContext } from "./project-context-provider";

export interface ChatContextValue {
  // Thread management
  activeThreadId: string;
  createThread: (thread?: Partial<Thread>) => Thread;
  setActiveThreadId: (threadId: string) => void;
  hideThread: (threadId: string) => void;
}

const createThreadId = () => crypto.randomUUID();

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: PropsWithChildren) {
  const { locator } = useProjectContext();

  // Get mutation actions
  const threadActions = useThreadActions();

  // Active Thread ID State
  const [activeThreadId, setActiveThreadId] = useLocalStorage<string>(
    LOCALSTORAGE_KEYS.threadManagerState(locator) + ":active-id", // Modified key to avoid conflict/mess with old state
    (existing) => existing || createThreadId(),
  );

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

  const value = {
    activeThreadId,
    createThread,
    setActiveThreadId,
    hideThread,
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

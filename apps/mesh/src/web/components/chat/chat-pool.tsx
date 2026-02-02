/**
 * Chat Pool Manager
 *
 * Manages multiple concurrent chat instances, each with its own useChat hook.
 * Implements LRU eviction policy to limit memory usage.
 */

import { useChat as useAIChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Metadata } from "./types";

// ============================================================================
// Type Definitions
// ============================================================================

export type ThreadStatus = "idle" | "streaming" | "completed" | "error";

export interface ThreadStatusInfo {
  status: ThreadStatus;
  lastActivity: Date;
  finishReason?: string;
}

export interface ChatInstance {
  threadId: string;
  chat: ReturnType<typeof useAIChat<UIMessage<Metadata>>>;
  status: ThreadStatus;
  lastActivity: Date;
}

interface ChatPoolContextValue {
  // Get chat instance for a thread (or null if not in pool)
  getChatInstance: (threadId: string) => ChatInstance | null;
  // Register a chat instance (called by ChatInstanceProvider)
  registerChatInstance: (
    threadId: string,
    chat: ReturnType<typeof useAIChat<UIMessage<Metadata>>>,
  ) => void;
  // Unregister a chat instance
  unregisterChatInstance: (threadId: string) => void;
  // Get status for a thread
  getThreadStatus: (threadId: string) => ThreadStatusInfo;
  // Update status for a thread
  updateThreadStatus: (threadId: string, status: ThreadStatusInfo) => void;
  // Get all thread IDs in the pool
  getActiveThreadIds: () => string[];
  // Check if thread is in pool
  isThreadInPool: (threadId: string) => boolean;
}

// ============================================================================
// Context
// ============================================================================

const ChatPoolContext = createContext<ChatPoolContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface ChatPoolProviderProps extends PropsWithChildren {
  maxPoolSize?: number;
}

export function ChatPoolProvider({
  children,
  maxPoolSize = 10,
}: ChatPoolProviderProps) {
  // Store chat instances
  const chatInstancesRef = useRef<Map<string, ChatInstance>>(new Map());

  // Store thread statuses separately (can exist without active chat instance)
  const [threadStatuses, setThreadStatuses] = useState<
    Map<string, ThreadStatusInfo>
  >(new Map());

  // LRU tracking - ordered list of thread IDs (most recent last)
  const lruOrderRef = useRef<string[]>([]);

  // Update LRU order when a thread is accessed
  // eslint-disable-next-line ban-memoization/ban-memoization -- Infrastructure code: stable reference needed for pool callbacks
  const updateLRU = useCallback((threadId: string) => {
    const index = lruOrderRef.current.indexOf(threadId);
    if (index > -1) {
      lruOrderRef.current.splice(index, 1);
    }
    lruOrderRef.current.push(threadId);
  }, []);

  // Evict least recently used thread if pool is full
  // eslint-disable-next-line ban-memoization/ban-memoization -- Infrastructure code: stable reference needed for pool callbacks
  const evictLRU = useCallback(() => {
    if (lruOrderRef.current.length === 0) return;

    const threadToEvict = lruOrderRef.current[0];
    if (!threadToEvict) return;

    const instance = chatInstancesRef.current.get(threadToEvict);

    // Don't evict if still streaming
    if (instance?.status === "streaming") {
      // Find first non-streaming thread to evict
      for (const threadId of lruOrderRef.current) {
        const inst = chatInstancesRef.current.get(threadId);
        if (inst && inst.status !== "streaming") {
          chatInstancesRef.current.delete(threadId);
          lruOrderRef.current = lruOrderRef.current.filter(
            (id) => id !== threadId,
          );
          console.log(`[ChatPool] Evicted non-streaming thread: ${threadId}`);
          return;
        }
      }
      // All threads are streaming, don't evict
      console.warn(
        "[ChatPool] All threads are streaming, cannot evict. Pool size:",
        chatInstancesRef.current.size,
      );
      return;
    }

    chatInstancesRef.current.delete(threadToEvict);
    lruOrderRef.current.shift();
    console.log(`[ChatPool] Evicted LRU thread: ${threadToEvict}`);
  }, []);

  // eslint-disable-next-line ban-memoization/ban-memoization -- Infrastructure code: stable reference needed for context API
  const registerChatInstance = useCallback(
    (
      threadId: string,
      chat: ReturnType<typeof useAIChat<UIMessage<Metadata>>>,
    ) => {
      // Check if we need to evict
      if (chatInstancesRef.current.size >= maxPoolSize) {
        evictLRU();
      }

      const instance: ChatInstance = {
        threadId,
        chat,
        status: "idle",
        lastActivity: new Date(),
      };

      chatInstancesRef.current.set(threadId, instance);
      updateLRU(threadId);

      console.log(
        `[ChatPool] Registered thread: ${threadId}, pool size: ${chatInstancesRef.current.size}`,
      );
    },
    [maxPoolSize, evictLRU, updateLRU],
  );

  // eslint-disable-next-line ban-memoization/ban-memoization -- Infrastructure code: stable reference needed for context API
  const unregisterChatInstance = useCallback((threadId: string) => {
    chatInstancesRef.current.delete(threadId);
    lruOrderRef.current = lruOrderRef.current.filter((id) => id !== threadId);
    console.log(
      `[ChatPool] Unregistered thread: ${threadId}, pool size: ${chatInstancesRef.current.size}`,
    );
  }, []);

  // eslint-disable-next-line ban-memoization/ban-memoization -- Infrastructure code: stable reference needed for context API
  const getChatInstance = useCallback(
    (threadId: string): ChatInstance | null => {
      const instance = chatInstancesRef.current.get(threadId);
      if (instance) {
        updateLRU(threadId);
        return instance;
      }
      return null;
    },
    [updateLRU],
  );

  // eslint-disable-next-line ban-memoization/ban-memoization -- Infrastructure code: stable reference needed for context API
  const getThreadStatus = useCallback(
    (threadId: string): ThreadStatusInfo => {
      // Check if we have a stored status
      const stored = threadStatuses.get(threadId);
      if (stored) {
        return stored;
      }

      // Check if we have an active instance
      const instance = chatInstancesRef.current.get(threadId);
      if (instance) {
        return {
          status: instance.status,
          lastActivity: instance.lastActivity,
        };
      }

      // Default to idle
      return {
        status: "idle",
        lastActivity: new Date(),
      };
    },
    [threadStatuses],
  );

  // eslint-disable-next-line ban-memoization/ban-memoization -- Infrastructure code: stable reference needed for context API
  const updateThreadStatus = useCallback(
    (threadId: string, statusInfo: ThreadStatusInfo) => {
      setThreadStatuses((prev) => {
        const next = new Map(prev);
        next.set(threadId, statusInfo);
        return next;
      });

      // Also update the instance if it exists
      const instance = chatInstancesRef.current.get(threadId);
      if (instance) {
        instance.status = statusInfo.status;
        instance.lastActivity = statusInfo.lastActivity;
      }
    },
    [],
  );

  // eslint-disable-next-line ban-memoization/ban-memoization -- Infrastructure code: stable reference needed for context API
  const getActiveThreadIds = useCallback((): string[] => {
    return Array.from(chatInstancesRef.current.keys());
  }, []);

  // eslint-disable-next-line ban-memoization/ban-memoization -- Infrastructure code: stable reference needed for context API
  const isThreadInPool = useCallback((threadId: string): boolean => {
    return chatInstancesRef.current.has(threadId);
  }, []);

  const value: ChatPoolContextValue = {
    getChatInstance,
    registerChatInstance,
    unregisterChatInstance,
    getThreadStatus,
    updateThreadStatus,
    getActiveThreadIds,
    isThreadInPool,
  };

  return (
    <ChatPoolContext.Provider value={value}>
      {children}
    </ChatPoolContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useChatPool() {
  const context = useContext(ChatPoolContext);
  if (!context) {
    throw new Error("useChatPool must be used within a ChatPoolProvider");
  }
  return context;
}

// ============================================================================
// Chat Instance Provider
// ============================================================================

interface ChatInstanceProviderProps extends PropsWithChildren {
  threadId: string;
  initialMessages: UIMessage<Metadata>[];
  transport: any;
  onFinish?: (args: {
    message: UIMessage<Metadata>;
    messages: UIMessage<Metadata>[];
    isAbort: boolean;
    isDisconnect: boolean;
    isError: boolean;
    finishReason?: string;
  }) => void;
  onToolCall?: (event: { toolCall: { toolName: string } }) => void;
  onError?: (error: Error) => void;
}

export function ChatInstanceProvider({
  threadId,
  initialMessages,
  transport,
  onFinish,
  onToolCall,
  onError,
  children,
}: ChatInstanceProviderProps) {
  const pool = useChatPool();

  // Create chat instance for this thread
  const chat = useAIChat<UIMessage<Metadata>>({
    id: threadId,
    messages: initialMessages,
    transport,
    onFinish: (args) => {
      // Update pool status
      pool.updateThreadStatus(threadId, {
        status: "completed",
        lastActivity: new Date(),
        finishReason: args.finishReason,
      });

      // Call original onFinish
      onFinish?.(args);
    },
    onToolCall,
    onError: (error) => {
      // Update pool status
      pool.updateThreadStatus(threadId, {
        status: "error",
        lastActivity: new Date(),
      });

      // Call original onError
      onError?.(error);
    },
  });

  // Store latest chat reference in a ref to avoid dependency issues
  const chatRef = useRef(chat);
  chatRef.current = chat;

  // Track registered threadId to avoid re-registration
  const registeredThreadIdRef = useRef<string | null>(null);

  // Register this instance with the pool (only once per threadId)
  // eslint-disable-next-line ban-use-effect/ban-use-effect -- Infrastructure code: side effect needed to register with pool
  useEffect(() => {
    // Only register if this is a new threadId
    if (registeredThreadIdRef.current !== threadId) {
      pool.registerChatInstance(threadId, chatRef.current);
      registeredThreadIdRef.current = threadId;
    }
  }, [threadId, pool]); // Removed 'chat' from dependencies - we update via ref

  // Keep the stored chat reference up to date (runs on every render but updates ref, not state)
  // eslint-disable-next-line ban-use-effect/ban-use-effect -- Infrastructure code: side effect needed to sync chat reference
  useEffect(() => {
    // Update the stored chat reference if this threadId is already registered
    if (registeredThreadIdRef.current === threadId) {
      const instance = pool.getChatInstance(threadId);
      if (instance) {
        instance.chat = chatRef.current;
      }
    }
  }); // No dependencies - runs on every render to keep chat reference fresh

  // Update status based on chat.status (only when status actually changes)
  // eslint-disable-next-line ban-use-effect/ban-use-effect -- Infrastructure code: side effect needed to sync status
  useEffect(() => {
    const status: ThreadStatus =
      chatRef.current.status === "submitted" ||
      chatRef.current.status === "streaming"
        ? "streaming"
        : "idle";

    // Get current status to avoid unnecessary updates
    const currentStatusInfo = pool.getThreadStatus(threadId);
    if (currentStatusInfo.status !== status) {
      pool.updateThreadStatus(threadId, {
        status,
        lastActivity: new Date(),
      });
    }
  }, [chat.status, threadId, pool]); // Keep chat.status to react to status changes

  return <>{children}</>;
}

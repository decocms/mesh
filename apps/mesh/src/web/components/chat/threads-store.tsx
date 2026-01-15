import { useThreadMessages, useThreads } from "@/web/hooks/use-chat-store";
import { Message, Thread } from "@/web/types/chat-threads";
import { createContext, PropsWithChildren, useContext, useState } from "react";
import { createStore, StoreApi } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/vanilla/shallow";

interface ThreadsState {
  threads: Thread[];
  selectedThreadId: string | null;
}

interface ThreadsActions {
  setSelectedThreadId: (threadId: string | null) => void;
  addThread: (thread: Thread) => void;
  updateThread: (thread: Thread) => void;
  deleteThread: (threadId: string) => void;
}

interface ThreadsStore extends ThreadsState {
  actions: ThreadsActions;
}

const ThreadsStoreContext = createContext<StoreApi<ThreadsStore> | null>(null);
const createThreadsStore = (
  initialState: Omit<ThreadsStore, "actions">,
  gatewayId: string | null,
) => {
  return createStore<ThreadsStore>()(
    persist(
      (set) => ({
        ...initialState,
        actions: {
          setSelectedThreadId: (threadId) =>
            set({ selectedThreadId: threadId }),
          addThread: (thread) =>
            set((state) => {
              return {
                ...state,
                threads: [...state.threads, thread],
              };
            }),
          updateThread: (thread) =>
            set((state) => {
              return {
                ...state,
                threads: state.threads.map((t) =>
                  t.id === thread.id ? thread : t,
                ),
              };
            }),
          deleteThread: (threadId) =>
            set((state) => {
              return {
                ...state,
                threads: state.threads.filter((t) => t.id !== threadId),
              };
            }),
        },
      }),
      {
        name: `threads-store-${encodeURIComponent(gatewayId ?? "decopilot")}`,
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          threads: state.threads,
          selectedThreadId: state.selectedThreadId,
        }),
      },
    ),
  );
};

function useThreadsStore<T>(
  selector: (state: ThreadsStore) => T,
  equalityFn?: (a: T, b: T) => boolean,
): T {
  const store = useContext(ThreadsStoreContext);
  if (!store) {
    throw new Error(
      "Missing GatewayStoreProvider - refresh the page. If the error persists, please contact support.",
    );
  }
  return useStoreWithEqualityFn(store, selector, equalityFn ?? shallow);
}

export function ThreadsStoreProvider({
  children,
  gatewayId,
}: PropsWithChildren<{ gatewayId: string | null }>) {
  const { threads } = useThreads({ gatewayId: gatewayId ?? undefined });
  const [store] = useState(() =>
    createThreadsStore({ threads, selectedThreadId: null }, gatewayId),
  );
  return (
    <ThreadsStoreContext.Provider value={store}>
      {children}
    </ThreadsStoreContext.Provider>
  );
}

export function useThreadsStoreThreads() {
  return useThreadsStore((state) => state.threads);
}

export function useSelectedThreadId() {
  return useThreadsStore((state) => state.selectedThreadId);
}

export function useThreadsStoreActions() {
  return useThreadsStore((state) => state.actions);
}

interface ThreadMessagesState {
  messages: Message[];
}

interface ThreadMessagesActions {
  addMessage: (message: Message) => void;
}

interface ThreadMessagesStore extends ThreadMessagesState {
  actions: ThreadMessagesActions;
}

const ThreadMessagesStoreContext =
  createContext<StoreApi<ThreadMessagesStore> | null>(null);
const createThreadMessagesStore = (
  initialState: Omit<ThreadMessagesStore, "actions">,
  threadId: string,
) => {
  return createStore<ThreadMessagesStore>()(
    persist(
      (set) => ({
        ...initialState,
        actions: {
          addMessage: (message) =>
            set((state) => {
              return {
                ...state,
                messages: [...state.messages, message],
              };
            }),
        },
      }),
      {
        name: `thread-messages-store-${encodeURIComponent(threadId)}`,
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          messages: state.messages,
        }),
      },
    ),
  );
};

function useThreadMessagesStore<T>(
  selector: (state: ThreadMessagesStore) => T,
  equalityFn?: (a: T, b: T) => boolean,
): T {
  const store = useContext(ThreadMessagesStoreContext);
  if (!store) {
    throw new Error(
      "Missing ThreadMessagesStoreProvider - refresh the page. If the error persists, please contact support.",
    );
  }
  return useStoreWithEqualityFn(store, selector, equalityFn ?? shallow);
}

export function ThreadMessagesStoreProvider({
  children,
  threadId,
}: PropsWithChildren<{ threadId: string }>) {
  const messages = useThreadMessages(threadId) as Message[];
  const [store] = useState(() =>
    createThreadMessagesStore({ messages }, threadId),
  );
  return (
    <ThreadMessagesStoreContext.Provider value={store}>
      {children}
    </ThreadMessagesStoreContext.Provider>
  );
}

export function useThreadMessagesStoreMessages() {
  return useThreadMessagesStore((state) => state.messages);
}
export function useThreadMessagesStoreActions() {
  return useThreadMessagesStore((state) => state.actions);
}

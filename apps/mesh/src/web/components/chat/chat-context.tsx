/**
 * ChatContextProvider — 3-context architecture replacing the singleton ChatStore.
 *
 * Three contexts split by update frequency:
 * - ChatStreamContext: messages, status, streaming state (updates on every token)
 * - ChatTaskContext: tasks, navigation, virtualMcpId (updates on task CRUD)
 * - ChatPrefsContext: model, credentials, app contexts, tiptap (updates on user action)
 *
 * The useChat id prop = taskId. Changing it creates a fresh Chat instance.
 * Provider is keyed by virtualMcpId so switching agents remounts everything.
 */

import {
  createContext,
  useContext,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { useChat as useAIChat, type UseChatHelpers } from "@ai-sdk/react";
import {
  lastAssistantMessageIsCompleteWithToolCalls,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  DefaultChatTransport,
  type UIMessage,
} from "ai";
import {
  selectDefaultModel,
  useProjectContext,
  useVirtualMCPs,
} from "@decocms/mesh-sdk";
import { toast } from "sonner";

import {
  useAiProviderKeyList,
  useAiProviderModels,
  type AiProviderModel,
} from "../../hooks/collections/use-llm";
import { useContext as useContextHook } from "../../hooks/use-context";
import { useNotification } from "../../hooks/use-notification";
import { usePreferences } from "../../hooks/use-preferences";
import { useInvalidateCollectionsOnToolCall } from "../../hooks/use-invalidate-collections-on-tool-call";
import { useTaskReadState } from "../../hooks/use-task-read-state";
import { authClient } from "../../lib/auth-client";
import { toMetadataModelInfo } from "../../lib/metadata-model-info";

import { useChatNavigation } from "./hooks/use-chat-navigation";
import { consumePendingMessage } from "./hooks/use-send-to-chat";
import { useStreamManager } from "./hooks/use-stream-manager";
import { useTaskManager, type TaskOwnerFilter } from "./task";
import { useTaskMessages } from "./task/use-task-manager";
import { derivePartsFromTiptapDoc } from "./derive-parts";
import type { VirtualMCPInfo } from "./select-virtual-mcp";
import type { ChatMessage, Metadata } from "./types";
import type { Task } from "./task/types";
import type {
  FinishPayload,
  SendMessageParams,
  SetAppContextParams,
} from "./store/types";
import { useLocalStorage } from "../../hooks/use-local-storage";
import { LOCALSTORAGE_KEYS } from "../../lib/localstorage-keys";

// ============================================================================
// Context Types
// ============================================================================

export interface ChatStreamContextValue {
  messages: ChatMessage[];
  status: "ready" | "submitted" | "streaming" | "error";
  sendMessage: (
    params: SendMessageParams | Metadata["tiptapDoc"],
  ) => Promise<void>;
  stop: () => void;
  /** @deprecated Use stop */
  cancelRun: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  addToolOutput: UseChatHelpers<ChatMessage>["addToolOutput"];
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  error: Error | null;
  clearError: () => void;
  finishReason: string | null;
  clearFinishReason: () => void;
  isStreaming: boolean;
  isChatEmpty: boolean;
  isWaitingForApprovals: boolean;
  isRunInProgress: boolean;
}

export interface ChatTaskContextValue {
  virtualMcpId: string;
  taskId: string;
  /** @deprecated Use taskId */
  activeTaskId: string;
  navigateToTask: (taskId: string) => void;
  /** @deprecated Use navigateToTask */
  switchToTask: (taskId: string) => void;
  createTask: () => void;
  tasks: Task[];
  hideTask: (taskId: string) => Promise<void>;
  renameTask: (taskId: string, title: string) => Promise<void>;
  setTaskStatus: (taskId: string, status: string) => Promise<void>;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  ownerFilter: TaskOwnerFilter;
  setOwnerFilter: (filter: TaskOwnerFilter) => void;
  isFilterChangePending: boolean;
}

export interface ChatPrefsContextValue {
  selectedModel: AiProviderModel | null;
  /** @deprecated Use selectedModel */
  model: AiProviderModel | null;
  setModel: (model: AiProviderModel) => void;
  /** @deprecated Use setModel */
  setSelectedModel: (model: AiProviderModel) => void;
  credentialId: string | null;
  setCredentialId: (id: string | null) => void;
  allModelsConnections: ReturnType<typeof useAiProviderKeyList>;
  isModelsLoading: boolean;
  virtualMcps: VirtualMCPInfo[];
  selectedVirtualMcp: VirtualMCPInfo | null;
  appContexts: Record<string, string>;
  setAppContext: (sourceId: string, params: SetAppContextParams) => void;
  clearAppContext: (sourceId: string) => void;
  tiptapDoc: Metadata["tiptapDoc"];
  setTiptapDoc: (doc: Metadata["tiptapDoc"]) => void;
  /** @deprecated Use tiptapDoc directly */
  tiptapDocRef: { current: Metadata["tiptapDoc"] };
  /** @deprecated No-op — virtualMcpId is URL-driven */
  setVirtualMcpId: (id: string | null) => void;
  /** @deprecated Use clearFinishReason */
  resetInteraction: () => void;
}

export type ChatContextValue = ChatStreamContextValue &
  ChatTaskContextValue &
  ChatPrefsContextValue;

// ============================================================================
// Contexts
// ============================================================================

const ChatStreamCtx = createContext<ChatStreamContextValue | null>(null);
const ChatTaskCtx = createContext<ChatTaskContextValue | null>(null);
const ChatPrefsCtx = createContext<ChatPrefsContextValue | null>(null);

// ============================================================================
// Constants
// ============================================================================

const MAX_APP_CONTEXT_LENGTH = 10_000;
const MAX_APP_CONTEXT_SOURCES = 10;

// ============================================================================
// Provider
// ============================================================================

export function ChatContextProvider({
  virtualMcpId,
  children,
}: PropsWithChildren<{ virtualMcpId: string }>) {
  const { org, locator } = useProjectContext();
  const { data: session } = authClient.useSession();
  const user = session?.user ?? null;

  // URL state
  const { taskId: urlTaskId, navigateToTask: rawNavigateToTask } =
    useChatNavigation();

  // Preferences
  const [preferences] = usePreferences();
  const { showNotification } = useNotification();
  const { markTaskRead } = useTaskReadState();

  // Model selection (localStorage-backed)
  const [storedModel, setStoredModel] = useLocalStorage<AiProviderModel | null>(
    LOCALSTORAGE_KEYS.chatSelectedModel(locator),
    null,
  );
  const [storedCredentialId, setStoredCredentialId] = useLocalStorage<
    string | null
  >(LOCALSTORAGE_KEYS.chatSelectedKeyId(locator), null);

  // AI provider keys and models
  const keys = useAiProviderKeyList();
  const effectiveKeyId = keys.some((k) => k.id === storedCredentialId)
    ? storedCredentialId
    : (keys[0]?.id ?? null);
  const { models: defaultKeyModels, isLoading: isModelsQueryLoading } =
    useAiProviderModels(effectiveKeyId ?? undefined);
  const effectiveProviderId =
    keys.find((k) => k.id === effectiveKeyId)?.providerId ?? "anthropic";
  const defaultModel = selectDefaultModel(
    defaultKeyModels,
    effectiveProviderId,
    effectiveKeyId ?? undefined,
  );
  const selectedModel = storedModel ?? defaultModel;
  const isModelsLoading = !storedModel && isModelsQueryLoading;

  // Virtual MCPs
  const virtualMcps = useVirtualMCPs();
  const selectedVirtualMcp = virtualMcps.find((v) => v.id === virtualMcpId) ?? {
    id: virtualMcpId,
    title: "",
    description: null,
    icon: null,
  };

  // Task management (scoped by virtualMcpId)
  const taskManager = useTaskManager(virtualMcpId);
  const { tasks } = taskManager;

  // taskId comes from the URL (seeded by router's validateSearch if absent)
  const effectiveTaskId = urlTaskId ?? tasks[0]?.id ?? "";

  // Messages for current task (from React Query / server)
  const serverMessages = useTaskMessages(effectiveTaskId || null);

  // Context prompt
  const contextPrompt = useContextHook(virtualMcpId);

  // App contexts
  const [appContexts, setAppContextsState] = useState<Record<string, string>>(
    {},
  );
  const setAppContext = (sourceId: string, params: SetAppContextParams) => {
    const textParts: string[] = [];
    for (const block of params.content ?? []) {
      if (block.type === "text" && block.text?.trim()) {
        textParts.push(block.text.trim());
      }
    }
    const text = textParts.join("\n");
    if (!text) {
      clearAppContext(sourceId);
      return;
    }
    if (new TextEncoder().encode(text).length > MAX_APP_CONTEXT_LENGTH) return;
    setAppContextsState((prev) => {
      if (
        Object.keys(prev).length >= MAX_APP_CONTEXT_SOURCES &&
        !(sourceId in prev)
      )
        return prev;
      return { ...prev, [sourceId]: text };
    });
  };
  const clearAppContext = (sourceId: string) => {
    setAppContextsState((prev) => {
      const { [sourceId]: _, ...rest } = prev;
      return rest;
    });
  };

  // Tiptap doc (transient UI state)
  const [tiptapDoc, setTiptapDoc] = useState<Metadata["tiptapDoc"]>(undefined);
  const [finishReason, setFinishReason] = useState<string | null>(null);
  const [chatError, setChatError] = useState<Error | null>(null);

  // Refs for transport closure (avoid stale captures)
  const prefsRef = useRef({
    toolApprovalLevel: preferences.toolApprovalLevel,
  });
  prefsRef.current = { toolApprovalLevel: preferences.toolApprovalLevel };

  // Transport (created once per provider mount via ref)
  const transportRef = useRef<DefaultChatTransport<UIMessage<Metadata>> | null>(
    null,
  );
  if (!transportRef.current) {
    transportRef.current = new DefaultChatTransport<UIMessage<Metadata>>({
      api: `/api/${org.slug}/decopilot/stream`,
      credentials: "include",
      prepareReconnectToStreamRequest: ({ id }) => ({
        api: `/api/${org.slug}/decopilot/attach/${id}`,
      }),
      prepareSendMessagesRequest: ({ messages, requestMetadata = {} }) => {
        const {
          system,
          tiptapDoc: _tiptapDoc,
          ...metadata
        } = requestMetadata as Metadata;
        const systemMessage: UIMessage<Metadata> | null = system
          ? {
              id: crypto.randomUUID(),
              role: "system",
              parts: [{ type: "text", text: system }],
            }
          : null;
        const userMessage = messages.slice(-1).filter(Boolean) as ChatMessage[];
        const allMessages = systemMessage
          ? [systemMessage, ...userMessage]
          : userMessage;

        const lastMsgMeta = (messages.at(-1)?.metadata ?? {}) as Metadata;
        const mergedMetadata = {
          ...metadata,
          agent: metadata.agent ?? lastMsgMeta.agent,
          models: metadata.models ?? lastMsgMeta.models,
          thread_id: metadata.thread_id ?? lastMsgMeta.thread_id,
        };

        return {
          api: `/api/${org.slug}/decopilot/stream`,
          body: {
            messages: allMessages,
            ...mergedMetadata,
            ...(prefsRef.current.toolApprovalLevel && {
              toolApprovalLevel: prefsRef.current.toolApprovalLevel,
            }),
          },
        };
      },
    });
  }

  const onToolCall = useInvalidateCollectionsOnToolCall();

  // AI SDK — useChat with taskId as id (key)
  const chat = useAIChat<ChatMessage>({
    id: effectiveTaskId,
    messages: serverMessages,
    transport: transportRef.current,
    sendAutomaticallyWhen: ({ messages }) =>
      lastAssistantMessageIsCompleteWithToolCalls({ messages }) ||
      lastAssistantMessageIsCompleteWithApprovalResponses({ messages }),
    onFinish: (payload: FinishPayload) => {
      setFinishReason(payload.finishReason ?? null);

      const serverThreadId = (payload.message.metadata as Metadata | undefined)
        ?.thread_id;

      // Handle server thread_id reassignment
      if (serverThreadId && serverThreadId !== effectiveTaskId) {
        rawNavigateToTask(serverThreadId);
      }

      if (payload.isAbort || payload.isDisconnect || payload.isError) {
        if (serverThreadId && payload.messages.length > 0) {
          taskManager.updateMessagesCache(serverThreadId, payload.messages);
        }
        return;
      }

      if (serverThreadId && payload.messages.length > 0) {
        taskManager.updateMessagesCache(serverThreadId, payload.messages);
      } else {
        console.warn(
          "[chat] onFinish: no thread_id in server metadata, messages not persisted",
        );
      }

      if (preferences.enableNotifications && showNotification) {
        const thread = tasks.find(
          (t) => t.id === (serverThreadId ?? effectiveTaskId),
        );
        showNotification({
          tag: `chat-${serverThreadId ?? effectiveTaskId}`,
          title: "Decopilot is waiting for your input at",
          body: thread?.title ?? "New chat",
        });
      }
    },
    onToolCall: onToolCall as never,
    onError: (error: Error) => {
      setChatError(error);
      console.error("[chat] Error", error);
    },
    onData: ({ data, type }) => {
      if (type === "data-thread-title") {
        const { title } = data;
        if (!title) return;
        taskManager.updateTask(effectiveTaskId, {
          title,
          updated_at: new Date().toISOString(),
        });
      }
    },
  });

  // Derived state
  const isStreaming =
    chat.status === "submitted" || chat.status === "streaming";
  const messages = chat.status !== "ready" ? chat.messages : serverMessages;
  const isChatEmpty = messages.length === 0;
  const lastMessage = messages.at(-1);
  const isWaitingForApprovals =
    !isStreaming &&
    lastMessage?.role === "assistant" &&
    lastMessage.parts.some(
      (part) => "state" in part && part.state === "approval-requested",
    );
  const thread = tasks.find((t) => t.id === effectiveTaskId);
  const isRunInProgress =
    (thread?.status === "in_progress" || thread?.status === "expired") &&
    chat.status === "ready";

  // Stream manager (SSE + resume) — task-scoped
  useStreamManager(effectiveTaskId, org.id, chat);

  // Consume pending message from in-memory Map (from useSendToChat)
  const pendingConsumedRef = useRef<string | null>(null);
  if (pendingConsumedRef.current !== effectiveTaskId) {
    const pending = consumePendingMessage(effectiveTaskId);
    if (pending) {
      pendingConsumedRef.current = effectiveTaskId;
      queueMicrotask(() => void sendMessageInternal(pending));
    }
  }

  // Navigate to task with read tracking
  const navigateToTask = (taskId: string) => {
    markTaskRead(taskId);
    rawNavigateToTask(taskId);
  };

  // sendMessage — captures context at call time
  async function sendMessageInternal(params: SendMessageParams): Promise<void> {
    const model = params.model ?? selectedModel;
    if (!model) {
      toast.error("No model configured");
      return;
    }

    const parts = params.parts ?? derivePartsFromTiptapDoc(params.tiptapDoc);
    if (parts.length === 0) return;

    // Capture at send time (frozen in closure)
    const capturedTaskId = effectiveTaskId;
    const capturedVirtualMcpId = virtualMcpId;

    if (params.model) setStoredModel(params.model);

    setFinishReason(null);
    setTiptapDoc(undefined);

    const messageMetadata: Metadata = {
      tiptapDoc: params.tiptapDoc,
      created_at: new Date().toISOString(),
      thread_id: capturedTaskId,
      agent: { id: capturedVirtualMcpId },
      user: {
        avatar: user?.image ?? undefined,
        name: user?.name ?? "you",
      },
      ...(preferences.toolApprovalLevel && {
        toolApprovalLevel: preferences.toolApprovalLevel,
      }),
    };

    const appContextEntries = Object.entries(appContexts);
    const appContextSection =
      appContextEntries.length > 0
        ? appContextEntries
            .map(([source, text]) => `### App Context: ${source}\n${text}`)
            .join("\n\n")
        : "";
    const system = [contextPrompt, appContextSection]
      .filter(Boolean)
      .join("\n\n");

    const metadata: Metadata = {
      ...messageMetadata,
      system,
      models: {
        credentialId: model.keyId ?? effectiveKeyId ?? "",
        thinking: toMetadataModelInfo(model),
        fast: toMetadataModelInfo(model),
      },
    };

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts,
      metadata: messageMetadata,
    };

    await chat.sendMessage(userMessage, { metadata });
  }

  // Cancel run
  const cancelRun = async () => {
    chat.stop();
    try {
      const res = await fetch(
        `/api/${org.slug}/decopilot/cancel/${effectiveTaskId}`,
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(data.message ?? `Cancel failed: ${res.status}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to cancel";
      toast.error(msg);
      console.error("[chat] cancelRun", err);
    }
  };

  // Create task (optimistic + navigate)
  const createTask = () => {
    const newId = taskManager.createTask();
    navigateToTask(newId);
  };

  // Hide task (switch to next after hiding)
  const hideTask = async (taskId: string) => {
    await taskManager.hideTask(taskId);
    if (taskId === effectiveTaskId) {
      const next = tasks.find((t) => t.id !== taskId && !t.hidden);
      if (next) {
        navigateToTask(next.id);
      } else {
        createTask();
      }
    }
  };

  // ---- Build context values ----

  // sendMessage wrapper: accept both SendMessageParams and raw tiptapDoc
  const sendMessagePublic = (
    params: SendMessageParams | Metadata["tiptapDoc"],
  ): Promise<void> => {
    if (params && typeof params === "object" && "type" in params) {
      return sendMessageInternal({
        tiptapDoc: params as Metadata["tiptapDoc"],
      });
    }
    return sendMessageInternal(params as SendMessageParams);
  };

  const streamValue: ChatStreamContextValue = {
    messages,
    status: chat.status,
    sendMessage: sendMessagePublic,
    stop: () => void cancelRun(),
    cancelRun: () => void cancelRun(),
    setMessages: chat.setMessages,
    addToolOutput: chat.addToolOutput,
    addToolApprovalResponse: chat.addToolApprovalResponse,
    error: chatError,
    clearError: () => setChatError(null),
    finishReason,
    clearFinishReason: () => setFinishReason(null),
    isStreaming,
    isChatEmpty,
    isWaitingForApprovals: isWaitingForApprovals ?? false,
    isRunInProgress,
  };

  const taskValue: ChatTaskContextValue = {
    virtualMcpId,
    taskId: effectiveTaskId,
    activeTaskId: effectiveTaskId,
    navigateToTask,
    switchToTask: navigateToTask,
    createTask,
    tasks,
    hideTask,
    renameTask: taskManager.renameTask,
    setTaskStatus: taskManager.setTaskStatus,
    hasNextPage: taskManager.hasNextPage ?? false,
    isFetchingNextPage: taskManager.isFetchingNextPage ?? false,
    fetchNextPage: taskManager.fetchNextPage ?? (() => {}),
    ownerFilter: taskManager.ownerFilter,
    setOwnerFilter: taskManager.setOwnerFilter,
    isFilterChangePending: taskManager.isFilterChangePending ?? false,
  };

  const prefsValue: ChatPrefsContextValue = {
    selectedModel,
    model: selectedModel,
    setModel: setStoredModel,
    setSelectedModel: setStoredModel,
    credentialId: effectiveKeyId,
    setCredentialId: setStoredCredentialId,
    allModelsConnections: keys,
    isModelsLoading,
    virtualMcps,
    selectedVirtualMcp,
    appContexts,
    setAppContext,
    clearAppContext,
    tiptapDoc,
    setTiptapDoc,
    tiptapDocRef: { current: tiptapDoc },
    setVirtualMcpId: () => {},
    resetInteraction: () => setFinishReason(null),
  };

  return (
    <ChatStreamCtx.Provider value={streamValue}>
      <ChatTaskCtx.Provider value={taskValue}>
        <ChatPrefsCtx.Provider value={prefsValue}>
          {children}
        </ChatPrefsCtx.Provider>
      </ChatTaskCtx.Provider>
    </ChatStreamCtx.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

function useChatStream(): ChatStreamContextValue {
  const ctx = useContext(ChatStreamCtx);
  if (!ctx)
    throw new Error("useChatStream must be used within ChatContextProvider");
  return ctx;
}

export function useChatTask(): ChatTaskContextValue {
  const ctx = useContext(ChatTaskCtx);
  if (!ctx)
    throw new Error("useChatTask must be used within ChatContextProvider");
  return ctx;
}

function useChatPrefs(): ChatPrefsContextValue {
  const ctx = useContext(ChatPrefsCtx);
  if (!ctx)
    throw new Error("useChatPrefs must be used within ChatContextProvider");
  return ctx;
}

/**
 * Combined context — use when you need values from all 3 contexts.
 * Prefer the specific hooks (useChatStream, useChatTask, useChatPrefs)
 * to avoid unnecessary re-renders.
 */
export function useChatContext(): ChatContextValue {
  return { ...useChatStream(), ...useChatTask(), ...useChatPrefs() };
}

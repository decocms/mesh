/**
 * Chat Provider — single merged provider.
 *
 * Takes virtualMcpId + taskId as props and owns every piece of per-task
 * state (useChat, messages, preferences, transport, appContexts, tiptapDoc,
 * task list). Keyed on taskId by the caller → full teardown + rebuild on
 * switch, including DefaultChatTransport.
 *
 * Provides three contexts to consumers: ChatTask, ChatPrefs, ChatStream.
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
  useVirtualMCP,
} from "@decocms/mesh-sdk";
import { toast } from "sonner";

import {
  useAiProviderKeys,
  useAiProviderModels,
  type AiProviderModel,
} from "../../hooks/collections/use-ai-providers";
import { useContext as useContextHook } from "../../hooks/use-context";
import {
  usePreferences,
  readToolApprovalLevel,
} from "../../hooks/use-preferences";
import { useInvalidateCollectionsOnToolCall } from "../../hooks/use-invalidate-collections-on-tool-call";
import { useTaskReadState } from "../../hooks/use-task-read-state";
import { authClient } from "../../lib/auth-client";
import { toMetadataModelInfo } from "../../lib/metadata-model-info";

import { useChatNavigation } from "./hooks/use-chat-navigation";
import { useStreamManager } from "./hooks/use-stream-manager";
import { useTaskManager, type TaskOwnerFilter } from "./task";
import { useTaskMessages } from "./task/use-task-manager";
import { derivePartsFromTiptapDoc } from "./derive-parts";
import type { VirtualMCPInfo } from "./select-virtual-mcp";
import type { ChatMessage, ChatMode, Metadata } from "./types";
import type { Task } from "./task/types";
import type {
  FinishPayload,
  SendMessageParams,
  SetAppContextParams,
} from "./store/types";
import { useLocalStorage } from "../../hooks/use-local-storage";
import { chatModeForTransportRef } from "../../lib/chat-mode-sync";
import { LOCALSTORAGE_KEYS } from "../../lib/localstorage-keys";
import { usePendingMessage } from "./pending-message-context";

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
  openTask: (taskId: string) => void;
  createTask: () => string;
  createTaskWithMessage: (params: {
    message: SendMessageParams;
    virtualMcpId?: string;
  }) => void;
  tasks: Task[];
  hideTask: (taskId: string) => Promise<void>;
  renameTask: (taskId: string, title: string) => Promise<void>;
  setTaskStatus: (taskId: string, status: string) => Promise<void>;
  ownerFilter: TaskOwnerFilter;
  setOwnerFilter: (filter: TaskOwnerFilter) => void;
  isFilterChangePending: boolean;
  pendingMessage: {
    taskId: string;
    message: SendMessageParams;
    createdAt: number;
  } | null;
  clearPendingMessage: () => void;
}

export interface ChatPrefsContextValue {
  selectedModel: AiProviderModel | null;
  setModel: (model: AiProviderModel) => void;
  credentialId: string | null;
  setCredentialId: (id: string | null) => void;
  allModelsConnections: ReturnType<typeof useAiProviderKeys>;
  isModelsLoading: boolean;
  selectedVirtualMcp: VirtualMCPInfo | null;
  /** Selected image generation model (null = no image models available) */
  imageModel: AiProviderModel | null;
  setImageModel: (model: AiProviderModel | null) => void;
  /** Selected deep research model (null = no deep research models available) */
  deepResearchModel: AiProviderModel | null;
  setDeepResearchModel: (model: AiProviderModel | null) => void;
  /** Chat mode for the next send — plan, web-search, gen-image, or default */
  chatMode: ChatMode;
  setChatMode: (mode: ChatMode) => void;
  appContexts: Record<string, string>;
  setAppContext: (sourceId: string, params: SetAppContextParams) => void;
  clearAppContext: (sourceId: string) => void;
  tiptapDoc: Metadata["tiptapDoc"];
  setTiptapDoc: (doc: Metadata["tiptapDoc"]) => void;
  /** @deprecated Use tiptapDoc directly */
  tiptapDocRef: { current: Metadata["tiptapDoc"] };
  /** Set ephemeral per-task agent override. Passing null resets to URL agent. */
  setVirtualMcpId: (id: string | null) => void;
  /** @deprecated No-op */
  resetInteraction: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_APP_CONTEXT_LENGTH = 10_000;
const MAX_APP_CONTEXT_SOURCES = 10;

// ============================================================================
// Contexts
// ============================================================================

const ChatStreamCtx = createContext<ChatStreamContextValue | null>(null);
const ChatTaskCtx = createContext<ChatTaskContextValue | null>(null);
const ChatPrefsCtx = createContext<ChatPrefsContextValue | null>(null);

// ============================================================================
// ChatProvider
// ============================================================================

export function ChatProvider({
  virtualMcpId,
  taskId,
  children,
}: PropsWithChildren<{ virtualMcpId: string; taskId: string }>) {
  const { org, locator } = useProjectContext();
  const { data: session } = authClient.useSession();
  const user = session?.user ?? null;

  // URL state (single call — need both nav helpers and branch)
  const {
    virtualMcpOverride,
    navigateToTask: rawNavigateToTask,
    setVirtualMcpOverride,
    branch: urlBranch,
  } = useChatNavigation();

  // Preferences
  const [preferences] = usePreferences();
  const { markTaskRead } = useTaskReadState();

  // Model selection (localStorage-backed)
  const [storedModel, setStoredModel] = useLocalStorage<AiProviderModel | null>(
    LOCALSTORAGE_KEYS.chatSelectedModel(locator),
    null,
  );
  const [storedCredentialId, setStoredCredentialId] = useLocalStorage<
    string | null
  >(LOCALSTORAGE_KEYS.chatSelectedKeyId(locator), null);

  // Image model selection (localStorage-backed).
  const [storedImageModel, setStoredImageModel] =
    useLocalStorage<AiProviderModel | null>(
      LOCALSTORAGE_KEYS.chatSelectedImageModel(locator),
      null,
    );

  // Deep research model selection (localStorage-backed).
  const [storedDeepResearchModel, setStoredDeepResearchModel] =
    useLocalStorage<AiProviderModel | null>(
      LOCALSTORAGE_KEYS.chatSelectedDeepResearchModel(locator),
      null,
    );

  const [chatMode, setChatMode] = useState<ChatMode>("default");
  chatModeForTransportRef.current = chatMode;

  // AI provider keys and models
  const keys = useAiProviderKeys();
  const effectiveKeyId = keys.some((k) => k.id === storedCredentialId)
    ? storedCredentialId
    : (keys[0]?.id ?? null);
  const { models: allKeyModels, isLoading: isModelsQueryLoading } =
    useAiProviderModels(effectiveKeyId ?? undefined);
  const effectiveProviderId =
    keys.find((k) => k.id === effectiveKeyId)?.providerId ?? "anthropic";
  const defaultModel = selectDefaultModel(
    allKeyModels,
    effectiveProviderId,
    effectiveKeyId ?? undefined,
  );
  const selectedModel = storedModel ?? defaultModel;
  const isModelsLoading = !storedModel && isModelsQueryLoading;

  // Image model auto-detection.
  const imageModels = allKeyModels.filter((m) =>
    m.capabilities?.includes("image"),
  );
  const storedModelIsAvailable =
    storedImageModel &&
    imageModels.some((m) => m.modelId === storedImageModel.modelId);
  const resolvedImageModel: AiProviderModel | null =
    (storedModelIsAvailable ? storedImageModel : null) ??
    imageModels[0] ??
    null;

  // Deep research model auto-detection + user override.
  const deepResearchModels = allKeyModels.filter((m) => {
    const n = m.modelId.toLowerCase().replace(/[^a-z0-9]/g, "");
    return n.includes("sonar") || n.includes("deepresearch");
  });
  const storedDeepResearchIsAvailable =
    storedDeepResearchModel &&
    deepResearchModels.some(
      (m) => m.modelId === storedDeepResearchModel.modelId,
    );
  const defaultDeepResearchModel =
    deepResearchModels.find((m) => m.modelId === "perplexity/sonar") ??
    deepResearchModels[0] ??
    null;
  const resolvedDeepResearchModel: AiProviderModel | null =
    (storedDeepResearchIsAvailable ? storedDeepResearchModel : null) ??
    defaultDeepResearchModel;

  // Task management (scoped by URL virtualMcpId — task list doesn't change on override)
  const taskManager = useTaskManager(virtualMcpId);
  const { tasks } = taskManager;

  // Effective agent: URL override (ephemeral per-task) ?? path param (thread owner)
  const effectiveVirtualMcpId = virtualMcpOverride ?? virtualMcpId;

  // Single-item fetch for the selected virtual MCP (no full list needed)
  const selectedVirtualMcpData = useVirtualMCP(effectiveVirtualMcpId);
  const selectedVirtualMcp: VirtualMCPInfo = selectedVirtualMcpData ?? {
    id: effectiveVirtualMcpId,
    title: "",
    description: null,
    icon: null,
  };

  // Context prompt (uses effective agent)
  const contextPrompt = useContextHook(effectiveVirtualMcpId);

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
  const tiptapDocRef = useRef<Metadata["tiptapDoc"]>(tiptapDoc);
  tiptapDocRef.current = tiptapDoc;

  // Transport (created once per provider mount via ref — this provider is
  // keyed on taskId by the caller, so a fresh transport is built per task)
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
            toolApprovalLevel: readToolApprovalLevel(),
            // mode comes from mergedMetadata (set in sendMessageInternal before
            // the mode state is reset). Reading from a ref here races with the
            // React state flush that resets chatMode to "default".
          },
        };
      },
    });
  }

  // Pending message state (hoisted to PendingMessageProvider above Suspense)
  const pendingMessageCtx = usePendingMessage();

  // Navigate to task with read tracking
  const navigateToTask = (
    nextTaskId: string,
    opts?: { virtualMcpOverride?: string },
  ) => {
    markTaskRead(nextTaskId);
    rawNavigateToTask(nextTaskId, opts);
  };

  // Create task (optimistic + navigate), returns new task ID
  const createTask = (): string => {
    const newId = taskManager.createTask();
    navigateToTask(newId);
    return newId;
  };

  // Create task + queue a pending message for the new Chat.Provider to consume
  const createTaskWithMessage = (params: {
    message: SendMessageParams;
    virtualMcpId?: string;
  }) => {
    const newId = taskManager.createTask();
    navigateToTask(newId, {
      virtualMcpOverride:
        params.virtualMcpId && params.virtualMcpId !== virtualMcpId
          ? params.virtualMcpId
          : undefined,
    });
    pendingMessageCtx.setPending({
      taskId: newId,
      message: params.message,
      createdAt: Date.now(),
    });
  };

  // Hide task (switch to next after hiding)
  const hideTask = async (id: string) => {
    await taskManager.hideTask(id);
    if (id === taskId) {
      const next = tasks.find((t) => t.id !== id && !t.hidden);
      if (next) {
        navigateToTask(next.id);
      } else {
        createTask();
      }
    }
  };

  // ---- Active-task state (previously ActiveTaskProvider) ----

  // Messages for current task (from React Query / server) — this is what suspends
  const serverMessages = useTaskMessages(taskId || null);

  const [finishReason, setFinishReason] = useState<string | null>(null);
  const [chatError, setChatError] = useState<Error | null>(null);

  const onToolCall = useInvalidateCollectionsOnToolCall();

  // AI SDK — useChat with taskId as id (multiplexed)
  const chat = useAIChat<ChatMessage>({
    id: taskId,
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
      if (serverThreadId && serverThreadId !== taskId) {
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
        taskManager.updateTask(taskId, {
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
  const thread = tasks.find((t) => t.id === taskId);
  const isRunInProgress =
    (thread?.status === "in_progress" || thread?.status === "expired") &&
    chat.status === "ready" &&
    messages.length > 0;

  // Stream manager (SSE + resume) — task-scoped
  useStreamManager(taskId, org.id, chat);

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
    const capturedTaskId = taskId;
    const capturedVirtualMcpId = virtualMcpId;

    if (params.model) {
      setStoredModel(params.model);
      if (params.model.keyId) setStoredCredentialId(params.model.keyId);
    }

    setFinishReason(null);
    setTiptapDoc(undefined);

    const messageMetadata: Metadata = {
      tiptapDoc: params.tiptapDoc,
      created_at: new Date().toISOString(),
      thread_id: capturedTaskId,
      agent: { id: capturedVirtualMcpId },
      ...(urlBranch ? { branch: urlBranch } : {}),
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

    let modeToSend: ChatMode = chatMode;
    if (modeToSend === "gen-image" && !resolvedImageModel) {
      modeToSend = "default";
    }
    if (modeToSend === "web-search" && !resolvedDeepResearchModel) {
      modeToSend = "default";
    }
    // One-shot modes (web-search, gen-image) reset after send.
    // Plan mode is persistent — the user must explicitly disable it.
    if (modeToSend !== "plan") {
      setChatMode("default");
    }

    const metadata: Metadata = {
      ...messageMetadata,
      system,
      models: {
        credentialId: model.keyId ?? effectiveKeyId ?? "",
        thinking: toMetadataModelInfo(model),
        fast: toMetadataModelInfo(model),
        ...(resolvedImageModel && {
          image: toMetadataModelInfo(resolvedImageModel),
        }),
        ...(resolvedDeepResearchModel && {
          deepResearch: toMetadataModelInfo(resolvedDeepResearchModel),
        }),
      },
      mode: modeToSend,
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
      const res = await fetch(`/api/${org.slug}/decopilot/cancel/${taskId}`, {
        method: "POST",
        credentials: "include",
      });
      // 404 means the thread was never persisted (optimistic-only) — nothing to cancel
      if (res.status === 404) return;
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

  // Consume pending message when this task is the target. consumeFor is
  // idempotent per taskId and handles TTL + clearing internally.
  const pendingForThisTask = pendingMessageCtx.consumeFor(taskId);
  if (pendingForThisTask) {
    const msg = pendingForThisTask;
    queueMicrotask(() => {
      void sendMessageInternal(msg);
    });
  }

  // ---- Build context values ----

  const taskValue: ChatTaskContextValue = {
    virtualMcpId: effectiveVirtualMcpId,
    taskId,
    openTask: navigateToTask,
    createTask,
    createTaskWithMessage,
    tasks,
    hideTask,
    renameTask: taskManager.renameTask,
    setTaskStatus: taskManager.setTaskStatus,
    ownerFilter: taskManager.ownerFilter,
    setOwnerFilter: taskManager.setOwnerFilter,
    isFilterChangePending: taskManager.isFilterChangePending ?? false,
    pendingMessage: pendingMessageCtx.pending,
    clearPendingMessage: pendingMessageCtx.clearPending,
  };

  const prefsValue: ChatPrefsContextValue = {
    selectedModel,
    setModel: (model: AiProviderModel) => {
      setStoredModel(model);
      if (model.keyId) setStoredCredentialId(model.keyId);
    },
    credentialId: effectiveKeyId,
    setCredentialId: setStoredCredentialId,
    allModelsConnections: keys,
    isModelsLoading,
    selectedVirtualMcp,
    imageModel: resolvedImageModel,
    setImageModel: (model: AiProviderModel | null) => {
      setStoredImageModel(model);
    },
    deepResearchModel: resolvedDeepResearchModel,
    setDeepResearchModel: (model: AiProviderModel | null) => {
      setStoredDeepResearchModel(model);
    },
    chatMode,
    setChatMode,
    appContexts,
    setAppContext,
    clearAppContext,
    tiptapDoc,
    setTiptapDoc,
    tiptapDocRef,
    setVirtualMcpId: setVirtualMcpOverride,
    resetInteraction: () => {},
  };

  const streamValue: ChatStreamContextValue = {
    messages,
    status: chat.status,
    sendMessage: sendMessagePublic,
    stop: () => void cancelRun(),
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

  return (
    <ChatTaskCtx.Provider value={taskValue}>
      <ChatPrefsCtx.Provider value={prefsValue}>
        <ChatStreamCtx.Provider value={streamValue}>
          {children}
        </ChatStreamCtx.Provider>
      </ChatPrefsCtx.Provider>
    </ChatTaskCtx.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

export function useChatStream(): ChatStreamContextValue {
  const ctx = useContext(ChatStreamCtx);
  if (!ctx) throw new Error("useChatStream must be used within ChatProvider");
  return ctx;
}

export function useOptionalChatStream(): ChatStreamContextValue | null {
  return useContext(ChatStreamCtx);
}

export function useChatTask(): ChatTaskContextValue {
  const ctx = useContext(ChatTaskCtx);
  if (!ctx) throw new Error("useChatTask must be used within ChatProvider");
  return ctx;
}

export function useChatPrefs(): ChatPrefsContextValue {
  const ctx = useContext(ChatPrefsCtx);
  if (!ctx) throw new Error("useChatPrefs must be used within ChatProvider");
  return ctx;
}

export function useOptionalChatPrefs(): ChatPrefsContextValue | null {
  return useContext(ChatPrefsCtx);
}

/**
 * Chat Context
 *
 * Manages chat interaction, thread management, virtual MCP/model selection, and chat session state.
 * Provides optimized state management to minimize re-renders across the component tree.
 */

import type { ToolSelectionStrategy } from "@/mcp-clients/virtual-mcp/types";
import { useChat as useAIChat, type UseChatHelpers } from "@ai-sdk/react";
import type { ProjectLocator } from "@decocms/mesh-sdk";
import {
  getWellKnownDecopilotVirtualMCP,
  useProjectContext,
  useVirtualMCPs,
} from "@decocms/mesh-sdk";
import type {
  EmbeddedResource,
  PromptMessage,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useReducer,
} from "react";
import { toast } from "sonner";
import { useModelConnections } from "../../hooks/collections/use-llm";
import { useAllowedModels } from "../../hooks/use-allowed-models";
import { useContext as useContextHook } from "../../hooks/use-context";
import { useInvalidateCollectionsOnToolCall } from "../../hooks/use-invalidate-collections-on-tool-call";
import { useLocalStorage } from "../../hooks/use-local-storage";
import { useNotification } from "../../hooks/use-notification";
import { usePreferences } from "../../hooks/use-preferences";
import { authClient } from "../../lib/auth-client";
import { LOCALSTORAGE_KEYS } from "../../lib/localstorage-keys";
import { type ModelChangePayload, useModels } from "./select-model";
import type { VirtualMCPInfo } from "./select-virtual-mcp";
import { useThreadManager } from "./thread";
import type { FileAttrs } from "./tiptap/file/node.tsx";
import type {
  ChatMessage,
  ChatModelsConfig,
  Metadata,
  ParentThread,
  Thread,
} from "./types.ts";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * State shape for chat state (reducer-managed)
 */
export interface ChatState {
  /** Tiptap document representing the current input (source of truth) */
  tiptapDoc: Metadata["tiptapDoc"];
  /** Active parent thread if branching is in progress */
  parentThread: ParentThread | null;
  /** Finish reason from the last chat completion */
  finishReason: string | null;
}

/**
 * Actions for the chat state reducer
 */
export type ChatStateAction =
  | { type: "SET_TIPTAP_DOC"; payload: Metadata["tiptapDoc"] }
  | { type: "CLEAR_TIPTAP_DOC" }
  | { type: "START_BRANCH"; payload: ParentThread }
  | { type: "CLEAR_BRANCH" }
  | { type: "SET_FINISH_REASON"; payload: string | null }
  | { type: "CLEAR_FINISH_REASON" }
  | { type: "RESET" };

/** Fields from useChat we pass through directly (typed via UseChatHelpers) */
type ChatFromUseChat = Pick<
  UseChatHelpers<ChatMessage>,
  | "messages"
  | "status"
  | "setMessages"
  | "error"
  | "clearError"
  | "stop"
  | "addToolOutput"
  | "addToolApprovalResponse"
>;

/**
 * Combined context value including interaction state, thread management, and session state
 */
interface ChatContextValue extends ChatFromUseChat {
  // Interaction state
  tiptapDoc: Metadata["tiptapDoc"];
  setTiptapDoc: (doc: Metadata["tiptapDoc"]) => void;
  clearTiptapDoc: () => void;
  resetInteraction: () => void;

  // Thread management
  activeThreadId: string;
  createThread: () => void; // For creating new threads (with prefetch)
  switchToThread: (threadId: string) => Promise<void>; // For switching with cache prefilling
  threads: Thread[];
  hideThread: (threadId: string) => void;

  // Thread pagination (for infinite scroll)
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;

  // Virtual MCP state
  virtualMcps: VirtualMCPInfo[];
  selectedVirtualMcp: VirtualMCPInfo | null;
  setVirtualMcpId: (virtualMcpId: string | null) => void;

  // Model state
  modelsConnections: ReturnType<typeof useModelConnections>;
  selectedModel: ChatModelsConfig | null;
  setSelectedModel: (model: ModelChangePayload) => void;

  // Mode state
  selectedMode: ToolSelectionStrategy;
  setSelectedMode: (mode: ToolSelectionStrategy) => void;

  // Chat state (extends useChat; sendMessage overridden, isStreaming/isChatEmpty derived)
  sendMessage: (tiptapDoc: Metadata["tiptapDoc"]) => Promise<void>;
  isStreaming: boolean;
  isChatEmpty: boolean;
  finishReason: string | null;
  clearFinishReason: () => void;
}

// ============================================================================
// Implementation
// ============================================================================

const createModelsTransport = (
  org: string,
): DefaultChatTransport<UIMessage<Metadata>> =>
  new DefaultChatTransport<UIMessage<Metadata>>({
    api: `/api/${org}/decopilot/stream`,
    credentials: "include",
    prepareSendMessagesRequest: ({ messages, requestMetadata = {} }) => {
      const {
        system,
        tiptapDoc: _tiptapDoc,
        toolApprovalLevel,
        ...metadata
      } = requestMetadata as Metadata & { toolApprovalLevel?: string };
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

      // Fall back to last message metadata when requestMetadata is missing models/agent
      const lastMsgMeta = (messages.at(-1)?.metadata ?? {}) as Metadata;
      const mergedMetadata = {
        ...metadata,
        agent: metadata.agent ?? lastMsgMeta.agent,
        models: metadata.models ?? lastMsgMeta.models,
        thread_id: metadata.thread_id ?? lastMsgMeta.thread_id,
      };

      return {
        body: {
          messages: allMessages,
          ...mergedMetadata,
          ...(toolApprovalLevel && { toolApprovalLevel }),
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

  // Fetch allowed models for current user's role
  const { isModelAllowed, allowAll } = useAllowedModels();

  // Determine connectionId to use (from stored selection or first available)
  const modelsConnection = findOrFirst(
    modelsConnections,
    modelState?.connectionId,
  );

  // Fetch models for the selected connection
  const allModels = useModels(modelsConnection?.id);

  // Filter models by permissions so defaults are always allowed
  const models =
    allowAll || !modelsConnection?.id
      ? allModels
      : allModels.filter((m) => isModelAllowed(modelsConnection.id, m.id));

  const cheapestModel = models
    .filter((m) => (m.costs?.input ?? 0) + (m.costs?.output ?? 0) > 0)
    .reduce<(typeof models)[number] | undefined>((min, model) => {
      const inputCost = model.costs?.input ?? 0;
      const outputCost = model.costs?.output ?? 0;
      const minCost = (min?.costs?.input ?? 0) + (min?.costs?.output ?? 0);
      return !min || minCost === 0 || inputCost + outputCost < minCost
        ? model
        : min;
    }, undefined);

  // Find the selected model from the filtered models using stored state
  const selectedModel = findOrFirst(models, modelState?.id);

  const selectedModelsConfig: ChatModelsConfig | null =
    selectedModel && modelsConnection?.id
      ? {
          connectionId: modelsConnection.id,
          thinking: {
            id: selectedModel.id,
            provider: selectedModel.provider ?? undefined,
            limits: selectedModel.limits ?? undefined,
            capabilities: selectedModel.capabilities
              ? {
                  vision: selectedModel.capabilities.includes("vision")
                    ? true
                    : undefined,
                  text: selectedModel.capabilities.includes("text")
                    ? true
                    : undefined,
                  tools: selectedModel.capabilities.includes("tools")
                    ? true
                    : undefined,
                }
              : undefined,
          },
          fast: cheapestModel
            ? {
                id: cheapestModel.id,
                provider: cheapestModel.provider ?? undefined,
                limits: cheapestModel.limits ?? undefined,
                capabilities: cheapestModel.capabilities
                  ? {
                      vision: cheapestModel.capabilities.includes("vision")
                        ? true
                        : undefined,
                      text: cheapestModel.capabilities.includes("text")
                        ? true
                        : undefined,
                      tools: cheapestModel.capabilities.includes("tools")
                        ? true
                        : undefined,
                    }
                  : undefined,
              }
            : undefined,
        }
      : null;

  return [selectedModelsConfig, setModelState] as const;
};

/**
 * Initial chat state
 */
const initialChatState: ChatState = {
  tiptapDoc: undefined,
  parentThread: null,
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
    case "SET_TIPTAP_DOC":
      return { ...state, tiptapDoc: action.payload };
    case "CLEAR_TIPTAP_DOC":
      return { ...state, tiptapDoc: undefined };
    case "START_BRANCH":
      return { ...state, parentThread: action.payload };
    case "CLEAR_BRANCH":
      return { ...state, parentThread: null };
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
 * Converts resource contents to UI message parts
 */
function resourcesToParts(
  contents: ReadResourceResult["contents"],
  mentionName: string, // uri for the resource
): ChatMessage["parts"] {
  const parts: ChatMessage["parts"] = [];

  for (const content of contents) {
    if ("text" in content && content.text) {
      parts.push({
        type: "text",
        text: `[${mentionName}]\n${content.text}`,
      });
    } else if ("blob" in content && content.blob && content.mimeType) {
      parts.push({
        type: "file",
        url: `data:${content.mimeType};base64,${content.blob}`,
        filename: String(content.uri),
        mediaType: String(content.mimeType),
      });
    }
  }

  return parts;
}

/**
 * Converts prompt messages to UI message parts
 */
function promptMessagesToParts(
  messages: PromptMessage[],
  mentionName: string,
): ChatMessage["parts"] {
  const parts: ChatMessage["parts"] = [];

  // Process MCP prompt messages and extract content
  for (const message of messages) {
    if (message.role !== "user" || !message.content) continue;

    const messageContents = Array.isArray(message.content)
      ? message.content
      : [message.content];

    for (const content of messageContents) {
      switch (content.type) {
        case "text": {
          const text = content.text?.trim();
          if (!text) {
            continue;
          }

          parts.push({
            type: "text",
            text: `[${mentionName}]\n${text}`,
          });
          break;
        }
        case "image":
        case "audio": {
          if (!content.data || !content.mimeType) {
            continue;
          }

          parts.push({
            type: "file",
            url: `data:${content.mimeType};base64,${content.data}`,
            mediaType: content.mimeType,
          });

          break;
        }
        case "resource": {
          const resource = content.resource as
            | EmbeddedResource["resource"]
            | undefined;

          if (!resource || !resource.mimeType) {
            continue;
          }

          if (resource) {
            if ("text" in resource && resource.text) {
              parts.push({
                type: "text",
                text: `[${mentionName}]\n${resource.text}`,
              });
            } else if (
              "blob" in resource &&
              resource.blob &&
              resource.mimeType
            ) {
              parts.push({
                type: "file",
                url: `data:${resource.mimeType};base64,${resource.blob}`,
                filename: String(resource.uri),
                mediaType: String(resource.mimeType),
              });
            }
          }
          break;
        }
      }
    }
  }

  return parts;
}

/**
 * Converts file attributes to UI message parts
 * Text files are decoded and returned as text parts, others as file parts
 */
function fileAttrsToParts(
  fileAttrs: FileAttrs,
  mentionName: string,
): ChatMessage["parts"] {
  const { mimeType, data } = fileAttrs;

  // Text files: decode base64 and return as text part
  if (mimeType.startsWith("text/")) {
    try {
      const decodedText = atob(data);
      return [
        {
          type: "text",
          text: `${mentionName}\n${decodedText}`,
        },
      ];
    } catch (error) {
      console.error("Failed to decode text file:", error);
      // Fall through to file part if decoding fails
    }
  }

  // Non-text files: return as file part
  return [
    {
      type: "file",
      url: `data:${mimeType};base64,${data}`,
      filename: mentionName,
      mediaType: mimeType,
    },
  ];
}

/**
 * Helper to derive UI parts from TiptapDoc
 * Walks the tiptap document to extract inline text and collect resources from prompt tags
 */
function derivePartsFromTiptapDoc(
  doc: Metadata["tiptapDoc"],
): ChatMessage["parts"] {
  if (!doc) return [];

  const parts: ChatMessage["parts"] = [];
  let inlineText = "";

  // Walk the tiptap document to build inline text and collect resources
  const walkNode = (
    node:
      | Metadata["tiptapDoc"]
      | {
          type: string;
          attrs?: Record<string, unknown>;
          content?: unknown[];
          text?: string;
        },
  ) => {
    if (!node) return;

    if (
      node.type === "text" &&
      "text" in node &&
      typeof node.text === "string"
    ) {
      inlineText += node.text;
    } else if (node.type === "mention" && node.attrs) {
      const char = (node.attrs.char as string | undefined) ?? "/";
      const mentionName = `${char}${node.attrs.name}`;

      // Add label to inline text
      inlineText += mentionName;

      // Handle resource mentions (@) vs prompt mentions (/)
      if (char === "@") {
        // Resource mentions: metadata contains ReadResourceResult.contents directly
        const contents = (node.attrs.metadata ||
          []) as ReadResourceResult["contents"];
        parts.push(...resourcesToParts(contents, mentionName));
      } else {
        // Prompt mentions: metadata contains PromptMessage[]
        const prompts = (node.attrs.metadata ||
          node.attrs.prompts ||
          []) as PromptMessage[];
        parts.push(...promptMessagesToParts(prompts, mentionName));
      }
    } else if (node.type === "file" && node.attrs) {
      const fileAttrs = node.attrs as unknown as FileAttrs;
      const mentionName = `[file:://${encodeURIComponent(fileAttrs.name)}]`;

      inlineText += mentionName;

      parts.push(...fileAttrsToParts(fileAttrs, mentionName));
    }

    // Recursively walk content
    if ("content" in node && Array.isArray(node.content)) {
      for (const child of node.content) {
        walkNode(child as typeof node);
      }
    }
  };

  walkNode(doc);

  // Add inline text as first part if there is any
  if (inlineText.trim()) {
    parts.unshift({ type: "text", text: inlineText.trim() });
  }

  return parts;
}

const ChatContext = createContext<ChatContextValue | null>(null);

/**
 * Provider component for chat context
 * Consolidates all chat-related state: interaction, threads, virtual MCP, model, and chat session
 */
export function ChatProvider({ children }: PropsWithChildren) {
  // ===========================================================================
  // 1. HOOKS - Call all hooks and derive state from them
  // ===========================================================================

  const { locator, org } = useProjectContext();

  // Unified thread manager hook handles all thread state and operations
  const threadManager = useThreadManager();

  // Project context
  // User session
  const { data: session } = authClient.useSession();
  const user = session?.user ?? null;
  // Preferences
  const [preferences] = usePreferences();
  // Chat state (reducer-based)
  const [chatState, chatDispatch] = useReducer(
    chatStateReducer,
    initialChatState,
  );

  // Virtual MCP state
  const virtualMcps = useVirtualMCPs();
  const [storedSelectedVirtualMcpId, setSelectedVirtualMcpId] = useLocalStorage<
    string | null
  >(`${locator}:selected-virtual-mcp-id`, null);

  // Model state — filter out connections where the user's role allows no models
  const allModelsConnections = useModelConnections();
  const { hasConnectionModels } = useAllowedModels();
  const modelsConnections = allModelsConnections.filter((conn) =>
    hasConnectionModels(conn.id),
  );
  const [selectedModel, setModel] = useModelState(locator, modelsConnections);

  // Mode state
  const [selectedMode, setSelectedMode] =
    useLocalStorage<ToolSelectionStrategy>(
      LOCALSTORAGE_KEYS.chatSelectedMode(locator),
      "code_execution",
    );

  // Messages are fetched by threadManager
  const initialMessages = threadManager.messages;

  // Context prompt
  const contextPrompt = useContextHook(storedSelectedVirtualMcpId);

  // Tool call handler
  const onToolCall = useInvalidateCollectionsOnToolCall();

  // Notification (sound + browser notification)
  const { showNotification } = useNotification();

  // ===========================================================================
  // 2. DERIVED VALUES - Compute values from hook state
  // ===========================================================================

  const selectedVirtualMcp = storedSelectedVirtualMcpId
    ? (virtualMcps.find((g) => g.id === storedSelectedVirtualMcpId) ?? null)
    : null;

  // Get decopilot ID for when no agent is explicitly selected (default agent)
  const decopilotId = getWellKnownDecopilotVirtualMCP(org.id).id;

  const transport = createModelsTransport(org.slug);

  // ===========================================================================
  // 3. HOOK CALLBACKS - Functions passed to hooks
  // ===========================================================================

  const onFinish = async ({
    finishReason,
    isAbort,
    isDisconnect,
    isError,
    message,
    messages,
  }: {
    message: ChatMessage;
    messages: ChatMessage[];
    isAbort: boolean;
    isDisconnect: boolean;
    isError: boolean;
    finishReason?: string;
  }) => {
    chatDispatch({ type: "SET_FINISH_REASON", payload: finishReason ?? null });

    if (isAbort || isDisconnect || isError) {
      return;
    }

    const { thread_id } = message.metadata ?? {};

    if (!thread_id) {
      return;
    }

    // Show notification (sound + browser popup) if enabled
    if (preferences.enableNotifications) {
      showNotification({
        tag: `chat-${thread_id}`,
        title: "Decopilot is waiting for your input at",
        body:
          threadManager.threads.find((t) => t.id === thread_id)?.title ??
          "New chat",
      });
    }

    if (finishReason !== "stop") {
      return;
    }

    // Update messages cache with the latest messages from the stream
    threadManager.updateMessagesCache(thread_id, messages);
  };

  const onError = (error: Error) => {
    console.error("[chat] Error", error);
  };

  // ===========================================================================
  // 4. HOOKS USING CALLBACKS - Hooks that depend on callback functions
  // ===========================================================================

  const chat = useAIChat<ChatMessage>({
    id: threadManager.activeThreadId,
    messages: initialMessages,
    transport,
    sendAutomaticallyWhen: ({ messages }) =>
      lastAssistantMessageIsCompleteWithToolCalls({ messages }) ||
      lastAssistantMessageIsCompleteWithApprovalResponses({ messages }),
    onFinish,
    onToolCall,
    onError,
    onData: ({ data, type }) => {
      if (type === "data-thread-title") {
        const { title } = data;

        if (!title) {
          return;
        }

        threadManager.updateThread(threadManager.activeThreadId, {
          title,
          updated_at: new Date().toISOString(),
        });
      }
    },
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

  // Thread actions are provided by threadManager
  const createThread = () => {
    resetInteraction();
    threadManager.createThread();
  };
  const switchToThread = threadManager.switchThread;
  const hideThread = threadManager.hideThread;

  // Chat state functions
  const setTiptapDoc = (doc: Metadata["tiptapDoc"]) =>
    chatDispatch({ type: "SET_TIPTAP_DOC", payload: doc });

  const clearTiptapDoc = () => chatDispatch({ type: "CLEAR_TIPTAP_DOC" });

  const resetInteraction = () => chatDispatch({ type: "RESET" });

  // Virtual MCP functions
  const setVirtualMcpId = (virtualMcpId: string | null) => {
    setSelectedVirtualMcpId(virtualMcpId);
  };

  // Model functions
  const setSelectedModel = (model: ModelChangePayload) => {
    setModel({ id: model.id, connectionId: model.connectionId });
  };

  // Chat functions
  const sendMessage = async (tiptapDoc: Metadata["tiptapDoc"]) => {
    if (!selectedModel) {
      toast.error("No model configured");
      return;
    }

    const parts = derivePartsFromTiptapDoc(tiptapDoc);

    if (parts.length === 0) {
      return;
    }

    resetInteraction();

    const messageMetadata: Metadata = {
      tiptapDoc,
      created_at: new Date().toISOString(),
      thread_id: threadManager.activeThreadId,
      agent: {
        id: selectedVirtualMcp?.id ?? decopilotId,
        mode: selectedMode,
      },
      user: {
        avatar: user?.image ?? undefined,
        name: user?.name ?? "you",
      },
    };

    const metadata: Metadata = {
      ...messageMetadata,
      system: contextPrompt,
      models: selectedModel,
      toolApprovalLevel: preferences.toolApprovalLevel,
    };

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts,
      metadata: messageMetadata,
    };

    await chat.sendMessage(userMessage, { metadata });
  };

  const stop = () => chat.stop();

  const clearFinishReason = () => chatDispatch({ type: "CLEAR_FINISH_REASON" });

  // ===========================================================================
  // 7. CONTEXT VALUE & RETURN
  // ===========================================================================

  const value: ChatContextValue = {
    // Chat state
    tiptapDoc: chatState.tiptapDoc,
    setTiptapDoc,
    clearTiptapDoc,
    resetInteraction,

    // Thread management (using threadManager)
    activeThreadId: threadManager.activeThreadId,
    threads: threadManager.threads,
    createThread,
    switchToThread,
    hideThread,

    // Thread pagination
    hasNextPage: threadManager.hasNextPage,
    isFetchingNextPage: threadManager.isFetchingNextPage,
    fetchNextPage: threadManager.fetchNextPage,

    // Virtual MCP state
    virtualMcps,
    selectedVirtualMcp,
    setVirtualMcpId,

    // Model state
    modelsConnections,
    selectedModel,
    setSelectedModel,

    // Mode state
    selectedMode,
    setSelectedMode,

    // Chat session state (from useChat)
    messages: chat.messages,
    status: chat.status,
    setMessages: chat.setMessages,
    error: chat.error,
    clearError: chat.clearError,
    stop,
    addToolOutput: chat.addToolOutput,
    addToolApprovalResponse: chat.addToolApprovalResponse,
    sendMessage,
    isStreaming,
    isChatEmpty,
    finishReason: chatState.finishReason,
    clearFinishReason,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

/**
 * Hook to access the full chat context
 * Returns interaction state, thread management, virtual MCP, model, and chat session state
 */
export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}

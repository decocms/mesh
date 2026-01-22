/**
 * Chat Context
 *
 * Manages chat interaction, thread management, virtual MCP/model selection, and chat session state.
 * Provides optimized state management to minimize re-renders across the component tree.
 */

import { useChat as useAIChat } from "@ai-sdk/react";
import type {
  EmbeddedResource,
  PromptMessage,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import {
  DefaultChatTransport,
  type UIDataTypes,
  type UIMessage,
  type UIMessagePart,
  type UITools,
} from "ai";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useReducer,
  useRef,
} from "react";
import { toast } from "sonner";
import { useModelConnections } from "../../hooks/collections/use-llm";
import { useThreadMessages } from "../../hooks/use-chat-store";
import { useContext as useContextHook } from "../../hooks/use-context";
import { useInvalidateCollectionsOnToolCall } from "../../hooks/use-invalidate-collections-on-tool-call";
import { useLocalStorage } from "../../hooks/use-local-storage";
import { authClient } from "../../lib/auth-client";
import { LOCALSTORAGE_KEYS } from "../../lib/localstorage-keys";
import type { ProjectLocator } from "@decocms/mesh-sdk";
import { useMCPClient, useProjectContext } from "@decocms/mesh-sdk";
import type { ChatMessage } from "./index";
import {
  type ModelChangePayload,
  type SelectedModelState,
  useModels,
} from "./select-model";
import type { VirtualMCPInfo } from "./select-virtual-mcp";
import { useVirtualMCPs } from "./select-virtual-mcp";
import type { FileAttrs } from "./tiptap/file/node.tsx";
import type { Message, Metadata, ParentThread, Thread } from "./types.ts";
import type { ThreadUpdateData } from "@/tools/thread/schema.ts";
import type { CollectionUpdateOutput } from "@decocms/bindings/collections";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

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

/**
 * Combined context value including interaction state, thread management, and session state
 */
interface ChatContextValue {
  // Interaction state
  tiptapDoc: Metadata["tiptapDoc"];
  setTiptapDoc: (doc: Metadata["tiptapDoc"]) => void;
  clearTiptapDoc: () => void;
  resetInteraction: () => void;

  // Thread management
  activeThreadId: string;
  setActiveThreadId: (threadId: string) => void;
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
  selectedModel: SelectedModelState | null;
  setSelectedModel: (model: ModelChangePayload) => void;

  // Chat state
  messages: ChatMessage[];
  chatStatus: "submitted" | "streaming" | "ready" | "error";
  isStreaming: boolean;
  isChatEmpty: boolean;
  sendMessage: (tiptapDoc: Metadata["tiptapDoc"]) => Promise<void>;
  stopStreaming: () => void;
  setMessages: (messages: ChatMessage[]) => void;
  chatError: Error | undefined;
  clearChatError: () => void;
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
        ...metadata
      } = requestMetadata as Metadata;
      const systemMessage: UIMessage<Metadata> | null = system
        ? {
            id: crypto.randomUUID(),
            role: "system",
            parts: [{ type: "text", text: system }],
          }
        : null;
      const userMessage = messages.slice(-1).filter(Boolean) as Message[];
      const allMessages = systemMessage
        ? [systemMessage, ...userMessage]
        : userMessage;

      return {
        body: {
          messages: allMessages,
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
    cheapModelId?: string | null;
  } | null>(LOCALSTORAGE_KEYS.chatSelectedModel(locator), null);

  // Determine connectionId to use (from stored selection or first available)
  const modelsConnection = findOrFirst(
    modelsConnections,
    modelState?.connectionId,
  );

  // Fetch models for the selected connection
  const models = useModels(modelsConnection?.id ?? null);
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

  // Find the selected model from the fetched models using stored state
  const selectedModel = findOrFirst(models, modelState?.id);

  const selectedModelState =
    selectedModel && modelsConnection?.id
      ? {
          id: selectedModel.id,
          provider: selectedModel.provider,
          limits: selectedModel.limits,
          capabilities: selectedModel.capabilities,
          connectionId: modelsConnection.id,
          cheapModelId: cheapestModel?.id,
        }
      : null;

  return [selectedModelState, setModelState] as const;
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
): UIMessagePart<UIDataTypes, UITools>[] {
  const parts: UIMessagePart<UIDataTypes, UITools>[] = [];

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
): UIMessagePart<UIDataTypes, UITools>[] {
  const parts: UIMessagePart<UIDataTypes, UITools>[] = [];

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
): UIMessagePart<UIDataTypes, UITools>[] {
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
): UIMessagePart<UIDataTypes, UITools>[] {
  if (!doc) return [];

  const parts: UIMessagePart<UIDataTypes, UITools>[] = [];
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

async function callUpdateThreadTool(
  client: Client | null,
  threadId: string,
  data: ThreadUpdateData,
) {
  if (!client) {
    throw new Error("MCP client is not available");
  }
  const result = (await client.callTool({
    name: "COLLECTION_THREADS_UPDATE",
    arguments: {
      id: threadId,
      data,
    },
  })) as { structuredContent?: unknown };
  const payload = (result.structuredContent ??
    result) as CollectionUpdateOutput<Thread>;
  return payload.item;
}

const ChatContext = createContext<ChatContextValue | null>(null);

/**
 * Provider component for chat context
 * Consolidates all chat-related state: interaction, threads, virtual MCP, model, and chat session
 */
export function ChatProvider({
  children,
  initialThreads,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: PropsWithChildren & {
  initialThreads: Thread[];
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
}) {
  const { locator, org } = useProjectContext();
  const [stateThreads, setStateThreads] = useLocalStorage<Thread[]>(
    LOCALSTORAGE_KEYS.assistantChatThreads(locator),
    initialThreads,
  );
  const [stateActiveThreadId, setStateActiveThreadId] = useLocalStorage<string>(
    LOCALSTORAGE_KEYS.assistantChatActiveThread(locator) + ":state",
    initialThreads[0]?.id ?? crypto.randomUUID(),
  );
  // ===========================================================================
  // 1. HOOKS - Call all hooks and derive state from them
  // ===========================================================================

  // MCP client for thread operations
  const mcpClient = useMCPClient({
    connectionId: null,
    orgSlug: org.slug,
  });

  // Project context
  // User session
  const { data: session } = authClient.useSession();
  const user = session?.user ?? null;
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

  // Model state
  const modelsConnections = useModelConnections();
  const [selectedModel, setModel] = useModelState(locator, modelsConnections);
  // Always fetch messages for the active thread - if it's truly new, the query returns empty
  const initialMessages = useThreadMessages(stateActiveThreadId);

  // Context prompt
  const contextPrompt = useContextHook(storedSelectedVirtualMcpId);

  // Tool call handler
  const onToolCall = useInvalidateCollectionsOnToolCall();

  // ===========================================================================
  // 2. DERIVED VALUES - Compute values from hook state
  // ===========================================================================

  const selectedVirtualMcp = storedSelectedVirtualMcpId
    ? (virtualMcps.find((g) => g.id === storedSelectedVirtualMcpId) ?? null)
    : null;

  const transport = createModelsTransport(org.slug);

  // ===========================================================================
  // 3. HOOK CALLBACKS - Functions passed to hooks
  // ===========================================================================

  const onFinish = async ({
    finishReason,
    messages: finishMessages,
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

    // Only add the assistant message - user message was already added before sendMessage
    const newMessages = finishMessages.slice(-1).filter(Boolean) as Message[];

    if (newMessages.length !== 1) {
      console.warn("[chat] Expected 1 message, got", newMessages.length);
      return;
    }

    const title = finishMessages.find((message) => message.metadata?.title)
      ?.metadata?.title;

    const isNewThread =
      stateThreads.findIndex((thread) => thread.id === stateActiveThreadId) ===
      -1;

    if (isNewThread) {
      setStateThreads((prevThreads) => {
        const existingThread = prevThreads.find(
          (thread) => thread.id === stateActiveThreadId,
        );
        if (existingThread) {
          return prevThreads;
        }
        const now = new Date().toISOString();
        const firstMessageCreatedAt =
          newMessages[0]?.metadata?.created_at ?? now;
        const parsedFirstMessageCreatedAt =
          typeof firstMessageCreatedAt === "string"
            ? firstMessageCreatedAt
            : new Date(firstMessageCreatedAt).toISOString();
        return [
          ...prevThreads,
          {
            id: stateActiveThreadId,
            title: title ?? "New Thread",
            createdAt: parsedFirstMessageCreatedAt,
            updatedAt: parsedFirstMessageCreatedAt,
          },
        ];
      });
    } else {
      // Update existing thread's updatedAt (and title if available)
      setStateThreads((prevThreads) =>
        prevThreads.map((thread) =>
          thread.id === stateActiveThreadId
            ? {
                ...thread,
                updatedAt: new Date().toISOString(),
                ...(title && { title }),
              }
            : thread,
        ),
      );
    }
  };

  const onError = (error: Error) => {
    console.error("[chat] Error", error);
  };

  // ===========================================================================
  // 4. HOOKS USING CALLBACKS - Hooks that depend on callback functions
  // ===========================================================================

  const chat = useAIChat<UIMessage<Metadata>>({
    id: stateActiveThreadId,
    messages: initialMessages,
    transport,
    onFinish,
    onToolCall,
    onError,
  });

  // Sync initialMessages to chat when thread changes or messages are loaded
  // useAIChat only uses `messages` prop as initial state, so we need to sync manually
  // Track by thread ID + first message ID to detect actual changes (not just reference)
  const syncKey = `${stateActiveThreadId}:${initialMessages[0]?.id ?? "empty"}:${initialMessages.length}`;
  const prevSyncKeyRef = useRef(syncKey);
  if (prevSyncKeyRef.current !== syncKey) {
    prevSyncKeyRef.current = syncKey;
    chat.setMessages(initialMessages);
  }

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
  const setTiptapDoc = (doc: Metadata["tiptapDoc"]) =>
    chatDispatch({ type: "SET_TIPTAP_DOC", payload: doc });

  const clearTiptapDoc = () => chatDispatch({ type: "CLEAR_TIPTAP_DOC" });

  const resetInteraction = () => chatDispatch({ type: "RESET" });

  const hideThread = async (threadId: string) => {
    try {
      const updatedThread = await callUpdateThreadTool(mcpClient, threadId, {
        hidden: true,
      });
      if (updatedThread) {
        const willHideCurrentThread = threadId === stateActiveThreadId;
        const firstDifferentThread = stateThreads.find(
          (thread) => thread.id !== threadId,
        );
        if (willHideCurrentThread) {
          setStateActiveThreadId(
            firstDifferentThread?.id ?? crypto.randomUUID(),
          );
        }
        setStateThreads((prevThreads) =>
          prevThreads.filter((thread) => thread.id !== threadId),
        );
      }
    } catch (error) {
      const err = error as Error;
      toast.error(`Failed to update thread: ${err.message}`);
      console.error("[chat] Failed to update thread:", error);
    }
  };

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
      thread_id: stateActiveThreadId,
      cheapModelId: selectedModel.cheapModelId,
      agent: {
        id: selectedVirtualMcp?.id ?? null,
      },
      user: {
        avatar: user?.image ?? undefined,
        name: user?.name ?? "you",
      },
    };

    const metadata: Metadata = {
      ...messageMetadata,
      system: contextPrompt,
      model: {
        id: selectedModel.id,
        connectionId: selectedModel.connectionId,
        provider: selectedModel.provider ?? undefined,
        limits: selectedModel.limits ?? undefined,
        capabilities: {
          vision: selectedModel.capabilities?.includes("vision") ?? undefined,
          text: selectedModel.capabilities?.includes("text") ?? undefined,
          tools: selectedModel.capabilities?.includes("tools") ?? undefined,
        },
      },
    };

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      parts,
      metadata: messageMetadata,
    };

    await chat.sendMessage(userMessage, { metadata });
  };

  const stopStreaming = () => chat.stop();

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

    // Thread management
    activeThreadId: stateActiveThreadId,
    threads: stateThreads,
    setActiveThreadId: setStateActiveThreadId,
    hideThread,

    // Thread pagination
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,

    // Virtual MCP state
    virtualMcps,
    selectedVirtualMcp,
    setVirtualMcpId,

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
 * Returns interaction state, thread management, virtual MCP, model, and chat session state
 */
export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}

import type { UseChatHelpers } from "@ai-sdk/react";
import type { ProjectLocator } from "@decocms/mesh-sdk";
import type { McpUiUpdateModelContextRequest } from "@modelcontextprotocol/ext-apps";
import type { AiProviderModel } from "../../../hooks/collections/use-ai-providers";
import type { VirtualMCPInfo } from "../select-virtual-mcp";
import type { Task } from "../task/types";
import type { TaskOwnerFilter } from "../task/use-task-manager";
import type { ChatMessage, Metadata } from "../types";

// ============================================================================
// Store State
// ============================================================================

export interface ChatStoreState {
  // Identity (set once via init, reset on project change)
  org: { id: string; slug: string };
  locator: ProjectLocator;
  user: { name: string; image?: string } | null;

  // Thread management
  activeThreadId: string;
  threads: Task[];
  threadMessages: Record<string, ChatMessage[]>;

  // Owner filter
  ownerFilter: TaskOwnerFilter;
  isFilterChangePending: boolean;

  // Selections (persisted to localStorage)
  selectedModel: AiProviderModel | null;
  isModelsLoading: boolean;
  selectedVirtualMcp: VirtualMCPInfo | null;
  credentialId: string | null;

  // All available model connections
  allModelsConnections: ReturnType<
    typeof import("../../../hooks/collections/use-ai-providers").useAiProviderKeys
  >;

  // Streaming
  status: "ready" | "submitted" | "streaming" | "error";
  error: Error | null;
  finishReason: string | null;

  // App contexts from ext-apps
  appContexts: Record<string, string>;

  // Tiptap doc ref (ChatInput owns the state, others read the ref)
  tiptapDoc: Metadata["tiptapDoc"];
}

// ============================================================================
// sendMessage params
// ============================================================================

export interface SendMessageParams {
  tiptapDoc?: Metadata["tiptapDoc"];
  parts?: ChatMessage["parts"];
  threadId?: string;
  model?: AiProviderModel;
  virtualMcp?: VirtualMCPInfo | null;
}

// ============================================================================
// Bridge — methods from useAIChat that the store delegates to
// ============================================================================

export interface ChatBridgeMethods {
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  stop: UseChatHelpers<ChatMessage>["stop"];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  resumeStream: UseChatHelpers<ChatMessage>["resumeStream"];
  addToolOutput: UseChatHelpers<ChatMessage>["addToolOutput"];
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
}

// ============================================================================
// onFinish payload — subset of what AI SDK passes
// ============================================================================

export interface FinishPayload {
  message: ChatMessage;
  messages: ChatMessage[];
  finishReason?: string;
  isAbort: boolean;
  isDisconnect: boolean;
  isError: boolean;
}

// ============================================================================
// setAppContext params
// ============================================================================

export type SetAppContextParams = McpUiUpdateModelContextRequest["params"];

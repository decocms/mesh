import type { JSONContent } from "@tiptap/core";
import type { UIMessage } from "ai";

// ============================================================================
// Chat Config Types
// ============================================================================

export interface ChatModelConfig {
  id: string;
  connectionId: string;
  provider?: string | null;
  limits?: {
    contextWindow?: number;
    maxOutputTokens?: number;
  };
  capabilities?: {
    vision?: boolean;
    text?: boolean;
    tools?: boolean;
  };
}

export interface ChatAgentConfig {
  id: string | null;
}

export interface ChatUserConfig {
  name?: string;
  avatar?: string;
}

// ============================================================================
// Tiptap Types
// ============================================================================

/**
 * Tiptap document type using DocumentType with our extension configuration
 * Uses TipTap's DocumentType matching our extension configuration
 * Makes attrs optional for JSON serialization compatibility
 */
export type TiptapDoc = {
  type: "doc";
  content: JSONContent[];
};

// Re-export JSONContent as TiptapNode for backwards compatibility
export type TiptapNode = JSONContent;

// ============================================================================
// Metadata Types
// ============================================================================

export interface Metadata {
  cheapModelId?: string | null;
  reasoning_start_at?: string | Date;
  reasoning_end_at?: string | Date;
  model?: ChatModelConfig;
  agent?: ChatAgentConfig;
  user?: ChatUserConfig;
  created_at?: string | Date;
  thread_id?: string;
  title?: string;
  /** System prompt to prepend to messages at the transport layer */
  system?: string;
  /** Tiptap document for rich user input (includes prompt tags with resources) */
  tiptapDoc?: TiptapDoc;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    providerMetadata?: {
      [key: string]: unknown;
    };
  };
}

// ============================================================================
// Chat Threads Types
// ============================================================================

export interface Thread {
  id: string;
  title: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  hidden?: boolean;
  virtualMcpId?: string; // Associate thread with specific virtual MCP
}

export type Message = UIMessage<Metadata>;

// ============================================================================
// Parent Thread Types
// ============================================================================

/**
 * Parent thread context for tracking message editing/branching flow
 * All fields refer to the parent message being branched from
 */
export interface ParentThread {
  /** Thread ID of the parent message */
  threadId: string;
  /** ID of the parent message being branched from */
  messageId: string;
}

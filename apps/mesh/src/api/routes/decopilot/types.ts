/**
 * Decopilot Core Abstractions
 *
 * Memory-based conversation management for AI assistants.
 *
 * Key concepts:
 * - Memory: Thread-based conversation history
 * - ModelProvider: LLM connection abstraction
 */

import type { LanguageModelV2 } from "@ai-sdk/provider";
import type { InferUITool, UIMessage } from "ai";
import type { Thread, ThreadMessage } from "@/storage/types";
import type { Metadata } from "@/web/components/chat/types";
import type { getBuiltInTools } from "./built-in-tools";

// ============================================================================
// Stream API Message Types
// ============================================================================

/**
 * Message type for chat - frontend and backend.
 * Validated messages from the client with proper Metadata typing.
 * Includes UITools for built-in tools (e.g. user_ask).
 */
export type ChatMessage = UIMessage<
  Metadata,
  {},
  {
    [K in keyof ReturnType<typeof getBuiltInTools>]: InferUITool<
      ReturnType<typeof getBuiltInTools>[K]
    >;
  }
>;

// ============================================================================
// Memory - Thread and message history
// ============================================================================

/**
 * Memory manages conversation history.
 *
 * Provides:
 * - Thread management (get or create)
 * - Message history loading
 * - Message saving
 * - Pruning for context window management
 */
export interface Memory {
  /** The current thread */
  readonly thread: Thread;

  /** Organization scope */
  readonly organizationId: string;

  /** Load conversation history */
  loadHistory(): Promise<ThreadMessage[]>;

  /** Save messages to the thread */
  save(messages: ThreadMessage[]): Promise<void>;

  /** Get messages pruned to window size */
  getPrunedHistory(windowSize: number): Promise<ThreadMessage[]>;
}

/**
 * Configuration for Memory
 */
export interface MemoryConfig {
  /** Thread ID (creates new if not found) */
  threadId?: string | null;

  /** Organization scope */
  organizationId: string;

  /** User who owns/created the thread */
  userId: string;

  /** Default window size for pruning */
  defaultWindowSize?: number;
}

// ============================================================================
// ModelProvider - LLM connection abstraction
// ============================================================================

/**
 * A ModelProvider creates language models from MCP connections.
 */
export interface ModelProvider {
  /** The AI SDK language model */
  readonly model: LanguageModelV2;

  /** Model ID (e.g., "gpt-4", "claude-3-opus") */
  readonly modelId: string;

  /** Connection ID that provides this model */
  readonly connectionId: string;

  /** Cheap model */
  readonly cheapModel?: LanguageModelV2 | undefined;
}

/**
 * Configuration for creating a ModelProvider
 */
export interface ModelProviderConfig {
  /** Model ID to use */
  modelId: string;

  /** Connection ID that provides the model */
  connectionId: string;

  /** Organization scope */
  organizationId: string;
}

// ============================================================================
// Message Processing Types
// ============================================================================

/**
 * Limits for model output
 */
export interface ModelLimits {
  /** Maximum tokens in context window */
  contextWindow?: number;

  /** Maximum tokens in output */
  maxOutputTokens?: number;
}

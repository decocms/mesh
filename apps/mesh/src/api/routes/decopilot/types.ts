/**
 * Decopilot Core Abstractions
 *
 * Mutable, event-driven AI assistant scoped to organizations.
 *
 * Key concepts:
 * - Agent: Mutable context (tools, prompts) that LLM can update during loops
 * - Memory: Thread-based conversation history
 * - EventBus: Background communication for async workflows
 * - Strategy: Pluggable behaviors for tool loading, prompts, memory
 */

import type { LanguageModelV2 } from "@ai-sdk/provider";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool, ToolSet } from "ai";
import type { Event, EventSubscription } from "@/storage/types";
import type { Thread, ThreadMessage } from "@/storage/types";

// ============================================================================
// AgentContext - Mutable state the LLM can read/write during execution
// ============================================================================

/**
 * Mutable context that the LLM can update during the conversation loop.
 *
 * This allows tools to:
 * - Add/remove other tools dynamically
 * - Update system prompts based on discoveries
 * - Store working memory across tool calls
 */
export interface AgentContext {
  /** Get a value from context */
  get<T = unknown>(key: string): T | undefined;

  /** Set a value in context */
  set<T = unknown>(key: string, value: T): void;

  /** Delete a value from context */
  delete(key: string): boolean;

  /** Check if key exists */
  has(key: string): boolean;

  /** Get all context as readonly snapshot */
  snapshot(): Readonly<Record<string, unknown>>;

  /** Clear all context */
  clear(): void;
}

// ============================================================================
// Agent - Mutable tools and prompts, updatable during LLM loop
// ============================================================================

/**
 * An Agent provides tools and context for the LLM.
 *
 * Unlike immutable patterns, Agent is designed to be mutated during
 * the conversation loop - the LLM can add tools, update prompts, etc.
 *
 * Lifecycle:
 * 1. Create agent (via factory)
 * 2. LLM uses tools, potentially modifying agent state
 * 3. Agent state persists across tool calls within a session
 * 4. Close when conversation ends
 */
export interface Agent {
  /** Organization this agent belongs to */
  readonly organizationId: string;

  /** The underlying MCP client (if connected to gateway) */
  readonly client: Client | null;

  /** Current tools - mutable, LLM can add/remove */
  readonly tools: ToolSet;

  /** Mutable context for working memory */
  readonly context: AgentContext;

  /** Current system prompts - mutable, LLM can update */
  readonly systemPrompts: string[];

  // ==========================================================================
  // Tool Management
  // ==========================================================================

  /** Add a tool (LLM can call this via a meta-tool) */
  addTool(name: string, tool: Tool): void;

  /** Remove a tool by name */
  removeTool(name: string): boolean;

  /** Check if tool exists */
  hasTool(name: string): boolean;

  /** Replace all tools */
  setTools(tools: ToolSet): void;

  // ==========================================================================
  // System Prompt Management
  // ==========================================================================

  /** Add a system prompt */
  addSystemPrompt(prompt: string): void;

  /** Remove a system prompt by index */
  removeSystemPrompt(index: number): boolean;

  /** Replace all system prompts */
  setSystemPrompts(prompts: string[]): void;

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /** Close connections and cleanup */
  close(): Promise<void>;
}

/**
 * Configuration for creating an Agent
 */
export interface AgentConfig {
  /** Organization ID (required - agents are org-scoped) */
  organizationId: string;

  /** Optional gateway ID (null = default gateway) */
  gatewayId?: string | null;

  /** Initial system prompts */
  systemPrompts?: string[];

  /** Initial tools (in addition to gateway tools) */
  tools?: ToolSet;

  /** Initial context values */
  initialContext?: Record<string, unknown>;

  /** Properties to inject into tool calls for monitoring */
  monitoringProperties?: Record<string, string>;
}

// ============================================================================
// AgentFactory - Creates agents with different strategies
// ============================================================================

/**
 * Strategy for loading tools into an agent
 */
export interface ToolLoadingStrategy {
  /** Load tools for the agent */
  loadTools(agent: Agent): Promise<ToolSet>;

  /** Refresh tools (called when agent needs updated tools) */
  refreshTools?(agent: Agent): Promise<ToolSet>;
}

/**
 * Strategy for building system prompts
 */
export interface SystemPromptStrategy {
  /** Build initial system prompts */
  buildPrompts(agent: Agent): Promise<string[]>;

  /** Update prompts based on context changes */
  updatePrompts?(agent: Agent): Promise<string[]>;
}

/**
 * Factory for creating agents with pluggable strategies
 */
export interface AgentFactory {
  /** Create an agent with the given config */
  create(config: AgentConfig): Promise<Agent>;

  /** Register a tool loading strategy */
  setToolStrategy(strategy: ToolLoadingStrategy): void;

  /** Register a system prompt strategy */
  setPromptStrategy(strategy: SystemPromptStrategy): void;
}

// ============================================================================
// Memory - Thread and message history
// ============================================================================

/**
 * Memory manages conversation history for an agent.
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
// Event Integration - Background communication via EventBus
// ============================================================================

/**
 * Event types for Decopilot communication
 */
export type DecopilotEventType =
  | "decopilot.message" // New message to process
  | "decopilot.tool.add" // Request to add a tool
  | "decopilot.tool.remove" // Request to remove a tool
  | "decopilot.context.update" // Update agent context
  | "decopilot.prompt.update"; // Update system prompts

/**
 * Decopilot event handler for processing background events
 */
export interface DecopilotEventHandler {
  /** Handle an incoming event */
  handleEvent(event: Event): Promise<DecopilotEventResult>;

  /** Subscribe to event types */
  subscribe(eventTypes: DecopilotEventType[]): Promise<EventSubscription[]>;

  /** Unsubscribe from events */
  unsubscribe(subscriptionIds: string[]): Promise<void>;
}

/**
 * Result of handling a Decopilot event
 */
export interface DecopilotEventResult {
  success: boolean;
  error?: string;
  /** Request retry after this many ms (for rate limiting, etc.) */
  retryAfter?: number;
  /** Response data */
  data?: unknown;
}

// ============================================================================
// Decopilot - Organization-scoped AI assistant service
// ============================================================================

/**
 * Decopilot is an organization-scoped AI assistant service.
 *
 * It combines:
 * - Agent (mutable tools/prompts/context)
 * - Memory (conversation history)
 * - Event handling (background communication)
 *
 * Decopilot instances are long-lived per organization, not per request.
 */
export interface Decopilot {
  /** Organization this Decopilot serves */
  readonly organizationId: string;

  /** The agent with mutable context */
  readonly agent: Agent;

  /** Event handler for background communication */
  readonly events: DecopilotEventHandler;

  // ==========================================================================
  // Conversation Management
  // ==========================================================================

  /** Create or get memory for a thread */
  getMemory(config: MemoryConfig): Promise<Memory>;

  /** Get a model provider */
  getModelProvider(config: ModelProviderConfig): Promise<ModelProvider>;

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /** Start the Decopilot service (subscribe to events, etc.) */
  start(): Promise<void>;

  /** Stop the Decopilot service */
  stop(): Promise<void>;

  /** Check if running */
  isRunning(): boolean;
}

/**
 * Configuration for creating a Decopilot instance
 */
export interface DecopilotConfig {
  /** Organization ID (required) */
  organizationId: string;

  /** Agent configuration */
  agent: Omit<AgentConfig, "organizationId">;

  /** Event types to subscribe to */
  eventSubscriptions?: DecopilotEventType[];

  /** Auto-start on creation */
  autoStart?: boolean;
}

// ============================================================================
// DecopilotRegistry - Manages Decopilot instances per organization
// ============================================================================

/**
 * Registry for managing Decopilot instances across organizations.
 *
 * Ensures one Decopilot per organization, handles lifecycle.
 */
export interface DecopilotRegistry {
  /** Get or create Decopilot for an organization */
  get(organizationId: string): Promise<Decopilot>;

  /** Check if Decopilot exists for organization */
  has(organizationId: string): boolean;

  /** Stop and remove Decopilot for organization */
  remove(organizationId: string): Promise<void>;

  /** Stop all Decopilots */
  shutdown(): Promise<void>;
}

// ============================================================================
// Message Processing Types
// ============================================================================

/**
 * Processed messages ready for the LLM
 */
export interface ProcessedMessages {
  /** System messages (from agent.systemPrompts) */
  system: Array<{ role: "system"; content: string }>;

  /** Conversation messages (pruned to window size) */
  messages: Array<{
    role: "user" | "assistant";
    content: unknown;
  }>;

  /** User messages from the current request (for saving) */
  userMessages: ThreadMessage[];

  /** Timestamp for the current request */
  requestTimestamp: string;
}

/**
 * Limits for model output
 */
export interface ModelLimits {
  /** Maximum tokens in context window */
  contextWindow?: number;

  /** Maximum tokens in output */
  maxOutputTokens?: number;
}

/**
 * Decopilot Module
 *
 * Exports all decopilot abstractions and the route handler.
 */

// Types
export type {
  Agent,
  AgentConfig,
  AgentContext,
  AgentFactory,
  Decopilot,
  DecopilotConfig,
  DecopilotEventHandler,
  DecopilotEventResult,
  DecopilotEventType,
  DecopilotRegistry,
  Memory,
  MemoryConfig,
  ModelLimits,
  ModelProvider,
  ModelProviderConfig,
  ProcessedMessages,
  SystemPromptStrategy,
  ToolLoadingStrategy,
} from "./types";

// Implementations
export { createAgentContext } from "./context";
export { createAgent } from "./agent";
export { createMemory } from "./memory";

// Route handler
export { default as decopilotRoutes } from "./routes";

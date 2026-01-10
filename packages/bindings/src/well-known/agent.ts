/**
 * Agent Well-Known Binding
 *
 * Defines the interface for accessing tools through an Agent (gateway).
 * An Agent aggregates tools from multiple connections and provides a unified
 * interface for tool discovery and execution.
 *
 * When an MCP binds to an Agent, it can:
 * - List all tools available through the Agent
 * - Call tools through the Agent endpoint
 * - The Agent handles authorization for all its underlying connections
 *
 * This binding is used by MCPs like Pilot that need access to multiple tools
 * from different connections without requiring individual connection bindings.
 *
 * @example
 * ```typescript
 * import { AgentBinding } from "@decocms/bindings/agent";
 *
 * // For a connection that provides an Agent
 * const client = AgentBinding.forConnection(connection);
 *
 * // The Agent provides access to tools via the gateway endpoint:
 * // GET /mcp/gateway/:agentId/tools/list
 * // POST /mcp/gateway/:agentId/tools/call
 * ```
 */

import { bindingClient, type ToolBinder } from "../core/binder";

/**
 * Agent Binding
 *
 * An Agent binding doesn't require specific tools - it's identified by
 * the gateway endpoint pattern. The Agent itself provides:
 * - tools/list: List all aggregated tools
 * - tools/call: Call a tool through the Agent
 *
 * This binding is used for connection matching - MCPs that need an Agent
 * will look for connections that provide gateway endpoints.
 */
export const AGENT_BINDING: ToolBinder[] = [];

/**
 * Agent Binding Client
 *
 * Use this to create a client for interacting with an Agent.
 * The client provides access to the Agent's gateway endpoint.
 *
 * @example
 * ```typescript
 * import { AgentBinding } from "@decocms/bindings/agent";
 *
 * const client = AgentBinding.forConnection(connection);
 * // Use the connection's gateway endpoint to access tools
 * ```
 */
export const AgentBinding = bindingClient(AGENT_BINDING);

/**
 * Type helper for the Agent binding client
 */
export type AgentBindingClient = ReturnType<typeof AgentBinding.forConnection>;

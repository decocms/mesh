/**
 * Virtual MCP Types
 *
 * Shared types for virtual MCP client abstractions
 */

import type { ConnectionEntity } from "../../tools/connection/schema";
import type { VirtualMCPEntity } from "../../tools/virtual/schema";
import type { McpListCache } from "../../mcp-clients/mcp-list-cache";

/** Options for creating an aggregator */
export interface VirtualClientOptions {
  connections: ConnectionEntity[];
  virtualMcp: VirtualMCPEntity;
  /** Whether to use superuser mode for background processes (bypasses auth checks on sub-clients) */
  superUser?: boolean;
  /** Cross-pod NATS KV cache for MCP lists (avoids MCP handshake on listTools/listResources/listPrompts) */
  mcpListCache?: McpListCache;
  /** Per-connection timeout (ms) for list operations (listTools/listResources/listPrompts). Connections that exceed this are skipped. */
  listTimeoutMs?: number;
}

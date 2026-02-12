/**
 * Workflows Plugin - Server Types
 *
 * Type definitions for the MeshContext shape used by workflow tools.
 * Tools receive MeshContext as `unknown` -- these types provide safe casting.
 */

import type { WorkflowPluginStorage } from "./storage";

/**
 * Minimal event bus interface exposed to workflow tools
 */
export interface WorkflowEventBus {
  publish(
    organizationId: string,
    publisherConnectionId: string,
    input: {
      type: string;
      subject?: string;
      data?: unknown;
    },
  ): Promise<unknown>;
}

/**
 * MCP proxy interface (subset of Client from @modelcontextprotocol/sdk)
 */
export interface MCPProxy {
  callTool: (
    params: { name: string; arguments?: Record<string, unknown> },
    resultSchema?: unknown,
    options?: { timeout?: number },
  ) => Promise<{
    content?: unknown;
    structuredContent?: unknown;
    isError?: boolean;
  }>;
  close: () => Promise<void>;
}

/**
 * MeshContext shape available to workflow tools.
 *
 * This is a subset of the full MeshContext -- only the parts workflows need.
 */
export interface WorkflowMeshContext {
  organization: { id: string; slug?: string; name?: string };
  auth: {
    user: { id: string; email?: string } | null;
  };
  access: {
    check: () => Promise<void>;
  };
  eventBus: WorkflowEventBus;
  connectionId?: string;
  createMCPProxy: (connectionId: string) => Promise<MCPProxy>;
}

/**
 * Cast unknown ctx to WorkflowMeshContext.
 * Throws if organization context is missing.
 */
export function requireWorkflowContext(ctx: unknown): WorkflowMeshContext {
  const meshCtx = ctx as WorkflowMeshContext;
  if (!meshCtx.organization) {
    throw new Error("Organization context required for workflow tools");
  }
  return meshCtx;
}

// ============================================================================
// Plugin storage singleton (set during plugin initialization)
// ============================================================================

let pluginStorage: WorkflowPluginStorage | null = null;

export function setPluginStorage(storage: WorkflowPluginStorage): void {
  pluginStorage = storage;
}

export function getPluginStorage(): WorkflowPluginStorage {
  if (!pluginStorage) {
    throw new Error(
      'Plugin storage not initialized. Make sure the "workflows" plugin is enabled.',
    );
  }
  return pluginStorage;
}

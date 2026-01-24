/**
 * Server Plugin Interface
 *
 * Defines the contract for server-side plugins that can extend Mesh with:
 * - MCP tools
 * - API routes (authenticated and public)
 * - Database migrations
 * - Storage factories
 *
 * Server plugins are separate from client plugins to avoid bundling
 * server code into the client bundle.
 */

import type { Hono } from "hono";
import type { Kysely } from "kysely";

/**
 * Tool definition compatible with MCP tools.
 * This is a simplified type - the actual implementation uses the full ToolDefinition from mesh.
 */
export interface ServerPluginToolDefinition {
  name: string;
  description?: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  handler: (input: unknown, ctx: unknown) => Promise<unknown>;
}

/**
 * Database migration definition for plugins.
 */
export interface ServerPluginMigration {
  /** Unique name for ordering (e.g., "001-initial-schema") */
  name: string;
  /** Apply the migration */
  up: (db: Kysely<unknown>) => Promise<void>;
  /** Revert the migration */
  down: (db: Kysely<unknown>) => Promise<void>;
}

/**
 * Context provided to server plugins for route registration and storage creation.
 */
export interface ServerPluginContext {
  /** Database instance */
  db: Kysely<unknown>;
  /** Credential vault for encrypting sensitive data */
  vault: {
    encrypt: (value: string) => Promise<string>;
    decrypt: (value: string) => Promise<string>;
  };
}

/**
 * Server Plugin interface.
 *
 * Plugins export this interface from their server entry point.
 * Tools are registered at startup but gated by org settings at runtime.
 */
export interface ServerPlugin {
  /** Unique plugin identifier (e.g., "gateway-templates") */
  id: string;

  /** Short description shown in settings UI */
  description?: string;

  /**
   * MCP tools this plugin provides.
   * Tools are wrapped with org-enabled gating at registration time.
   */
  tools?: ServerPluginToolDefinition[];

  /**
   * Authenticated API routes.
   * Mounted at /api/plugins/:pluginId/*
   * Requires Mesh authentication.
   */
  routes?: (app: Hono, ctx: ServerPluginContext) => void;

  /**
   * Public API routes (no authentication required).
   * Mounted at the root level.
   * Use for endpoints that external users access (e.g., connect flow).
   */
  publicRoutes?: (app: Hono, ctx: ServerPluginContext) => void;

  /**
   * Database migrations for this plugin.
   * Run alongside core migrations in name order.
   */
  migrations?: ServerPluginMigration[];

  /**
   * Factory to create plugin-specific storage adapters.
   * Called during context initialization.
   */
  createStorage?: (ctx: ServerPluginContext) => unknown;
}

/**
 * Type helper for any server plugin
 */
export type AnyServerPlugin = ServerPlugin;

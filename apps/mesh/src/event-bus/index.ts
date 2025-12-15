/**
 * Event Bus Module
 *
 * Provides a unified event bus for MCP Mesh.
 * Automatically selects the appropriate implementation based on database type.
 *
 * - PostgreSQL: Uses LISTEN/NOTIFY for efficient event notification (reuses Pool)
 * - SQLite: Uses polling for event delivery
 */

import type { MeshDatabase } from "../database";
import type { EventBus, EventBusConfig, NotifySubscriberFn } from "./interface";
import { PostgresEventBus } from "./postgres-worker";
import { SqliteEventBus } from "./sqlite-worker";

// Re-export types
export * from "./interface";
export { createNotifySubscriber } from "./notify";

/**
 * Create an EventBus instance based on database type
 *
 * Uses the MeshDatabase discriminated union to select the right implementation:
 * - PostgreSQL: Reuses the existing Pool for LISTEN/NOTIFY
 * - SQLite: Uses polling
 *
 * @param database - MeshDatabase instance (discriminated union)
 * @param notifySubscriber - Callback to notify subscribers of events
 * @param config - Optional event bus configuration
 * @returns EventBus instance
 */
export function createEventBus(
  database: MeshDatabase,
  notifySubscriber: NotifySubscriberFn,
  config?: EventBusConfig,
): EventBus {
  if (database.type === "postgres") {
    return new PostgresEventBus(
      database.db,
      database.pool,
      notifySubscriber,
      config,
    );
  }

  return new SqliteEventBus(database.db, notifySubscriber, config);
}

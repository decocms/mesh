/**
 * Event Bus Module
 *
 * Provides a unified event bus for MCP Mesh.
 *
 * Architecture:
 * - EventBus: Single class handling publish/subscribe and worker management
 * - EventBusStorage: Database operations (unified for SQLite/PostgreSQL via Kysely)
 * - EventBusWorker: Polling and delivery logic
 * - NotifyStrategy: Optional immediate wake-up (PostgreSQL uses LISTEN/NOTIFY)
 *
 * Usage:
 * ```ts
 * const eventBus = createEventBus(database, notifySubscriber, config);
 * await eventBus.start();
 * ```
 */

import type { MeshDatabase } from "../database";
import { createEventBusStorage } from "../storage/event-bus";
import { EventBus as EventBusImpl } from "./event-bus";
import type { EventBus, EventBusConfig, NotifySubscriberFn } from "./interface";
import { PostgresNotifyStrategy } from "./postgres-notify";

// Re-export types and interfaces
export {
  type EventBusConfig,
  type IEventBus,
  type NotifySubscriberFn,
  type PublishEventInput,
  type SubscribeInput,
} from "./interface";

// Export EventBus type alias (for typing in tests/consumers)
export type { EventBus } from "./interface";

export { createNotifySubscriber } from "./notify";
export type { NotifyStrategy } from "./notify-strategy";

/**
 * Create an EventBus instance based on database type
 *
 * For PostgreSQL: Uses LISTEN/NOTIFY for immediate wake-up + polling fallback
 * For SQLite: Uses polling only
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
  const storage = createEventBusStorage(database.db);

  // Create notify strategy for PostgreSQL (uses LISTEN/NOTIFY)
  // For SQLite, no notify strategy - relies on polling only
  const notifyStrategy =
    database.type === "postgres"
      ? new PostgresNotifyStrategy(database.db, database.pool)
      : undefined;

  return new EventBusImpl({
    storage,
    notifySubscriber,
    config,
    notifyStrategy,
  });
}

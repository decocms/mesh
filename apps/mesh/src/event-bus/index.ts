/**
 * Event Bus Module
 *
 * Provides a unified event bus for MCP Mesh.
 *
 * Architecture:
 * - EventBus: Single class handling publish/subscribe and worker management
 * - EventBusStorage: Database operations (unified for SQLite/PostgreSQL via Kysely)
 * - EventBusWorker: Event processing and delivery logic (no internal polling)
 * - NotifyStrategy: Triggers worker processing
 *   - SQLite: Timer-based polling
 *   - PostgreSQL: Event-based via LISTEN/NOTIFY
 *
 * Usage:
 * ```ts
 * const eventBus = createEventBus(database, config);
 * await eventBus.start();
 * ```
 */

import type { MeshDatabase } from "../database";
import { createEventBusStorage } from "../storage/event-bus";
import { EventBus as EventBusImpl } from "./event-bus";
import {
  DEFAULT_EVENT_BUS_CONFIG,
  type EventBus,
  type EventBusConfig,
} from "./interface";
import { PollingStrategy } from "./polling";
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

export type { NotifyStrategy } from "./notify-strategy";

/**
 * Create an EventBus instance based on database type
 *
 * For PostgreSQL: Uses LISTEN/NOTIFY for event-based wake-up (no polling)
 * For SQLite: Uses timer-based polling
 *
 * @param database - MeshDatabase instance (discriminated union)
 * @param config - Optional event bus configuration
 * @returns EventBus instance
 */
export function createEventBus(
  database: MeshDatabase,
  config?: EventBusConfig,
): EventBus {
  const storage = createEventBusStorage(database.db);
  const pollIntervalMs =
    config?.pollIntervalMs ?? DEFAULT_EVENT_BUS_CONFIG.pollIntervalMs;

  // Create notify strategy based on database type
  // - PostgreSQL: LISTEN/NOTIFY (event-based, no polling)
  // - Other: Timer-based polling
  const notifyStrategy =
    database.type === "postgres"
      ? new PostgresNotifyStrategy(database.db, database.pool)
      : new PollingStrategy(pollIntervalMs);

  return new EventBusImpl({
    storage,
    config,
    notifyStrategy,
  });
}

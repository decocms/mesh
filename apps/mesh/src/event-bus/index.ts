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
 *   - PostgreSQL: LISTEN/NOTIFY + polling safety net (for scheduled retries)
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
import { compose } from "./notify-strategy";
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

// Re-export storage types used in the interface
export type {
  SyncSubscriptionsInput,
  SyncSubscriptionsResult,
} from "../storage/event-bus";

// Export EventBus type alias (for typing in tests/consumers)
export type { EventBus } from "./interface";

export type { NotifyStrategy } from "./notify-strategy";

/**
 * Create an EventBus instance based on database type
 *
 * For PostgreSQL: Uses LISTEN/NOTIFY + polling safety net
 *   - LISTEN/NOTIFY: Immediate delivery when events are published
 *   - Polling: Picks up scheduled retries (retryAfter, failed deliveries)
 * For SQLite: Uses timer-based polling only
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
  // - PostgreSQL: LISTEN/NOTIFY + polling (for scheduled retries)
  // - Other: Timer-based polling only
  const notifyStrategy =
    database.type === "postgres"
      ? compose(
          new PollingStrategy(pollIntervalMs), // Safety net for retries
          new PostgresNotifyStrategy(database.db, database.pool), // Immediate delivery
        )
      : new PollingStrategy(pollIntervalMs);

  return new EventBusImpl({
    storage,
    config,
    notifyStrategy,
  });
}

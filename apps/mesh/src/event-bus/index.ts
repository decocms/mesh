/**
 * Event Bus Module
 *
 * Provides a unified event bus for MCP Mesh.
 * Automatically selects the appropriate implementation based on database type.
 *
 * - PostgreSQL: Uses LISTEN/NOTIFY for efficient event notification
 * - SQLite: Uses polling for event delivery
 */

import type { Kysely } from "kysely";
import type { Database } from "../storage/types";
import type { EventBus, EventBusConfig, NotifySubscriberFn } from "./interface";
import { PostgresEventBus } from "./postgres-worker";
import { SqliteEventBus } from "./sqlite-worker";

// Re-export types
export * from "./interface";
export { createNotifySubscriber } from "./notify";

/**
 * Database type detection
 */
type DatabaseType = "postgres" | "sqlite";

/**
 * Detect database type from DATABASE_URL
 */
function detectDatabaseType(databaseUrl?: string): DatabaseType {
  if (!databaseUrl) return "sqlite";

  const url = databaseUrl.toLowerCase();
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    return "postgres";
  }
  return "sqlite";
}

/**
 * Create an EventBus instance based on database type
 *
 * @param db - Kysely database instance
 * @param notifySubscriber - Callback to notify subscribers of events
 * @param config - Optional event bus configuration
 * @param databaseUrl - Optional database URL for type detection and PostgreSQL LISTEN
 * @returns EventBus instance
 */
export function createEventBus(
  db: Kysely<Database>,
  notifySubscriber: NotifySubscriberFn,
  config?: EventBusConfig,
  databaseUrl?: string,
): EventBus {
  const dbType = detectDatabaseType(databaseUrl);

  if (dbType === "postgres") {
    return new PostgresEventBus(db, notifySubscriber, config, databaseUrl);
  }

  return new SqliteEventBus(db, notifySubscriber, config);
}

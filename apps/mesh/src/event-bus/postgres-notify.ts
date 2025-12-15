/**
 * PostgreSQL Notify Strategy
 *
 * Uses PostgreSQL's LISTEN/NOTIFY mechanism to wake up the event bus worker
 * immediately when new events are published, instead of waiting for polling.
 *
 * Architecture:
 * - `notify()`: Uses pg_notify() to send a notification on a channel
 * - `start()`: Acquires a connection from the pool and LISTENs on the channel
 * - When a notification is received, calls onNotify() to trigger immediate processing
 */

import { type Kysely, sql } from "kysely";
import type { Pool, PoolClient } from "pg";
import type { Database } from "../storage/types";
import type { NotifyStrategy } from "./notify-strategy";

const NOTIFY_CHANNEL = "mesh_events";

/**
 * PostgreSQL LISTEN/NOTIFY strategy for waking up the event bus worker.
 */
export class PostgresNotifyStrategy implements NotifyStrategy {
  private listenClient: PoolClient | null = null;
  private onNotify: (() => void) | null = null;

  /**
   * Create a PostgreSQL notify strategy.
   *
   * @param db - Kysely database instance (used for pg_notify)
   * @param pool - PostgreSQL connection pool (used for LISTEN)
   */
  constructor(
    private db: Kysely<Database>,
    private pool: Pool,
  ) {}

  async start(onNotify: () => void): Promise<void> {
    if (this.listenClient) return; // Already started

    this.onNotify = onNotify;

    try {
      // Acquire a dedicated connection for LISTEN
      // This connection stays open to receive notifications
      this.listenClient = await this.pool.connect();

      // Set up notification handler
      this.listenClient.on("notification", (msg) => {
        if (msg.channel === NOTIFY_CHANNEL && this.onNotify) {
          this.onNotify();
        }
      });

      // Handle connection errors - log but don't crash
      this.listenClient.on("error", (err) => {
        console.error("[PostgresNotify] Connection error:", err);
        // Try to reconnect on next poll cycle
        this.cleanup();
      });

      // Start listening
      await this.listenClient.query(`LISTEN ${NOTIFY_CHANNEL}`);
      console.log("[PostgresNotify] Started LISTEN on", NOTIFY_CHANNEL);
    } catch (error) {
      console.error("[PostgresNotify] Failed to start LISTEN:", error);
      this.cleanup();
    }
  }

  async stop(): Promise<void> {
    if (this.listenClient) {
      try {
        await this.listenClient.query(`UNLISTEN ${NOTIFY_CHANNEL}`);
        console.log("[PostgresNotify] Stopped LISTEN on", NOTIFY_CHANNEL);
      } catch {
        // Ignore errors during cleanup
      }
      this.cleanup();
    }
  }

  async notify(eventId: string): Promise<void> {
    try {
      // Use pg_notify to send notification
      // The eventId is sent as the payload (useful for debugging)
      await sql`SELECT pg_notify(${NOTIFY_CHANNEL}, ${eventId})`.execute(
        this.db,
      );
    } catch (error) {
      // NOTIFY failure is not critical - polling will still pick it up
      console.warn("[PostgresNotify] Failed to send NOTIFY:", error);
    }
  }

  private cleanup(): void {
    if (this.listenClient) {
      this.listenClient.release();
      this.listenClient = null;
    }
    this.onNotify = null;
  }
}

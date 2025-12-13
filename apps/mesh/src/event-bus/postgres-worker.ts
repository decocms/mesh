/**
 * PostgreSQL Event Bus Implementation
 *
 * Uses LISTEN/NOTIFY for efficient event notification.
 * Falls back to polling as a safety mechanism.
 *
 * Architecture:
 * - When an event is published, we insert into the table and NOTIFY 'mesh_events'
 * - The worker listens for NOTIFY and wakes up immediately to process
 * - Polling still runs as a fallback in case notifications are missed
 */

import { type Kysely, sql } from "kysely";
import { Pool, type PoolClient } from "pg";
import type { Database, Event, EventSubscription } from "../storage/types";
import {
  createEventBusStorage,
  type EventBusStorage,
} from "../storage/event-bus";
import {
  type EventBus,
  type EventBusConfig,
  type NotifySubscriberFn,
  type PublishEventInput,
  type SubscribeInput,
} from "./interface";
import { EventBusWorker } from "./worker";

const NOTIFY_CHANNEL = "mesh_events";

/**
 * PostgreSQL-based EventBus implementation
 * Uses LISTEN/NOTIFY for efficient event delivery with polling fallback
 */
export class PostgresEventBus implements EventBus {
  private storage: EventBusStorage;
  private worker: EventBusWorker;
  private pool: Pool | null = null;
  private listenClient: PoolClient | null = null;
  private running = false;
  private db: Kysely<Database>;

  constructor(
    db: Kysely<Database>,
    notifySubscriber: NotifySubscriberFn,
    config?: EventBusConfig,
    connectionString?: string,
  ) {
    this.db = db;
    this.storage = createEventBusStorage(db);
    this.worker = new EventBusWorker(this.storage, notifySubscriber, config);

    // Create pool for LISTEN if connection string provided
    if (connectionString) {
      this.pool = new Pool({
        connectionString,
        max: 1, // Only need one connection for LISTEN
      });
    }
  }

  async publish(
    organizationId: string,
    sourceConnectionId: string,
    input: PublishEventInput,
  ): Promise<Event> {
    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Create the event
    const event = await this.storage.publishEvent({
      id: eventId,
      organizationId,
      type: input.type,
      source: sourceConnectionId,
      subject: input.subject,
      time: now,
      data: input.data,
    });

    // Find matching subscriptions and create deliveries
    const subscriptions = await this.storage.getMatchingSubscriptions(event);
    if (subscriptions.length > 0) {
      await this.storage.createDeliveries(
        eventId,
        subscriptions.map((s) => s.id),
      );

      // Send NOTIFY to wake up the worker
      try {
        await sql`SELECT pg_notify(${NOTIFY_CHANNEL}, ${eventId})`.execute(
          this.db,
        );
      } catch (error) {
        // NOTIFY failure is not critical - polling will still pick it up
        console.warn("[EventBus] Failed to send NOTIFY:", error);
      }
    }

    return event;
  }

  async subscribe(
    organizationId: string,
    input: SubscribeInput,
  ): Promise<EventSubscription> {
    return this.storage.subscribe({
      id: crypto.randomUUID(),
      organizationId,
      connectionId: input.connectionId,
      publisher: input.publisher,
      eventType: input.eventType,
      filter: input.filter,
    });
  }

  async unsubscribe(
    organizationId: string,
    subscriptionId: string,
  ): Promise<{ success: boolean }> {
    return this.storage.unsubscribe(subscriptionId, organizationId);
  }

  async listSubscriptions(
    organizationId: string,
    connectionId?: string,
  ): Promise<EventSubscription[]> {
    return this.storage.listSubscriptions(organizationId, connectionId);
  }

  async getSubscription(
    organizationId: string,
    subscriptionId: string,
  ): Promise<EventSubscription | null> {
    return this.storage.getSubscription(subscriptionId, organizationId);
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    // Start the polling worker (fallback)
    this.worker.start();

    // Start LISTEN if pool is available
    if (this.pool) {
      this.startListen().catch((error) => {
        console.error("[EventBus] Failed to start LISTEN:", error);
      });
    }
  }

  stop(): void {
    this.running = false;
    this.worker.stop();
    this.stopListen().catch((error) => {
      console.error("[EventBus] Error stopping LISTEN:", error);
    });
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Start listening for NOTIFY events
   */
  private async startListen(): Promise<void> {
    if (!this.pool || this.listenClient) return;

    try {
      this.listenClient = await this.pool.connect();

      // Set up notification handler
      this.listenClient.on("notification", (msg) => {
        if (msg.channel === NOTIFY_CHANNEL) {
          // Trigger immediate processing
          this.worker.processNow().catch((error) => {
            console.error("[EventBus] Error processing after NOTIFY:", error);
          });
        }
      });

      // Start listening
      await this.listenClient.query(`LISTEN ${NOTIFY_CHANNEL}`);
      console.log("[EventBus] Started LISTEN on", NOTIFY_CHANNEL);
    } catch (error) {
      console.error("[EventBus] Failed to start LISTEN:", error);
      this.listenClient?.release();
      this.listenClient = null;
    }
  }

  /**
   * Stop listening for NOTIFY events
   */
  private async stopListen(): Promise<void> {
    if (this.listenClient) {
      try {
        await this.listenClient.query(`UNLISTEN ${NOTIFY_CHANNEL}`);
      } catch {
        // Ignore errors during cleanup
      }
      this.listenClient.release();
      this.listenClient = null;
    }

    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

/**
 * Event Bus Implementation
 *
 * Single, unified EventBus class that handles:
 * - Publishing events
 * - Managing subscriptions
 * - Background event delivery via EventBusWorker
 * - Optional immediate notification via NotifyStrategy
 *
 * Architecture:
 * - EventBusStorage: Database operations (unified for SQLite/PostgreSQL via Kysely)
 * - EventBusWorker: Polling and delivery logic
 * - NotifyStrategy: Optional - wakes up worker immediately (e.g., PostgreSQL LISTEN/NOTIFY)
 */

import type { Event, EventSubscription } from "../storage/types";
import type { EventBusStorage } from "../storage/event-bus";
import type {
  IEventBus,
  EventBusConfig,
  NotifySubscriberFn,
  PublishEventInput,
  SubscribeInput,
} from "./interface";
import type { NotifyStrategy } from "./notify-strategy";
import { EventBusWorker } from "./worker";

/**
 * Configuration for creating an EventBus instance
 */
export interface EventBusOptions {
  /** Database storage operations */
  storage: EventBusStorage;
  /** Callback to deliver events to subscribers */
  notifySubscriber: NotifySubscriberFn;
  /** Optional event bus configuration */
  config?: EventBusConfig;
  /** Optional notify strategy for immediate wake-up (e.g., PostgreSQL LISTEN/NOTIFY) */
  notifyStrategy?: NotifyStrategy;
}

/**
 * Unified EventBus implementation
 *
 * Works with any database (SQLite, PostgreSQL) via EventBusStorage.
 * Supports optional immediate notification via NotifyStrategy.
 */
export class EventBus implements IEventBus {
  private storage: EventBusStorage;
  private worker: EventBusWorker;
  private notifyStrategy?: NotifyStrategy;
  private running = false;

  constructor(options: EventBusOptions) {
    this.storage = options.storage;
    this.notifyStrategy = options.notifyStrategy;
    this.worker = new EventBusWorker(
      this.storage,
      options.notifySubscriber,
      options.config,
    );
  }

  async publish(
    organizationId: string,
    sourceConnectionId: string,
    input: PublishEventInput,
  ): Promise<Event> {
    const eventId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Create the event in the database
    const event = await this.storage.publishEvent({
      id: eventId,
      organizationId,
      type: input.type,
      source: sourceConnectionId,
      subject: input.subject,
      time: now,
      data: input.data,
    });

    // Find matching subscriptions and create delivery records
    const subscriptions = await this.storage.getMatchingSubscriptions(event);
    if (subscriptions.length > 0) {
      await this.storage.createDeliveries(
        eventId,
        subscriptions.map((s) => s.id),
      );

      // Notify strategy to wake up workers immediately (optional)
      // If no strategy or notify fails, polling will still pick it up
      if (this.notifyStrategy) {
        await this.notifyStrategy.notify(eventId).catch((error) => {
          console.warn("[EventBus] Notify failed (non-critical):", error);
        });
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

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Start the polling worker (also resets stuck deliveries from previous crashes)
    await this.worker.start();

    // Start notify strategy if available (e.g., PostgreSQL LISTEN)
    if (this.notifyStrategy) {
      await this.notifyStrategy.start(() => {
        // When notified, trigger immediate processing
        this.worker.processNow().catch((error) => {
          console.error("[EventBus] Error processing after notify:", error);
        });
      });
    }
  }

  stop(): void {
    this.running = false;
    this.worker.stop();

    // Stop notify strategy if available
    if (this.notifyStrategy) {
      this.notifyStrategy.stop().catch((error) => {
        console.error("[EventBus] Error stopping notify strategy:", error);
      });
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}

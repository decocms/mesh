/**
 * SQLite Event Bus Implementation
 *
 * Uses polling to check for pending events.
 * This is the fallback implementation for SQLite databases
 * which don't support LISTEN/NOTIFY.
 */

import type { Kysely } from "kysely";
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

/**
 * SQLite-based EventBus implementation
 * Uses polling for event delivery
 */
export class SqliteEventBus implements EventBus {
  private storage: EventBusStorage;
  private worker: EventBusWorker;

  constructor(
    db: Kysely<Database>,
    notifySubscriber: NotifySubscriberFn,
    config?: EventBusConfig,
  ) {
    this.storage = createEventBusStorage(db);
    this.worker = new EventBusWorker(this.storage, notifySubscriber, config);
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
    this.worker.start();
  }

  stop(): void {
    this.worker.stop();
  }

  isRunning(): boolean {
    return this.worker.isRunning();
  }
}

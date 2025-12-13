/**
 * Event Bus Worker
 *
 * Base worker implementation for processing and delivering events.
 * Handles batching events per subscriber and calling ON_EVENTS.
 */

import type { CloudEvent } from "@decocms/bindings";
import type { EventBusStorage, PendingDelivery } from "../storage/event-bus";
import type { Event } from "../storage/types";
import {
  DEFAULT_EVENT_BUS_CONFIG,
  type EventBusConfig,
  type NotifySubscriberFn,
} from "./interface";

/**
 * Convert internal Event to CloudEvent format
 */
function toCloudEvent(event: Event): CloudEvent {
  return {
    specversion: "1.0",
    id: event.id,
    source: event.source,
    type: event.type,
    time: event.time,
    subject: event.subject ?? undefined,
    datacontenttype: event.datacontenttype,
    dataschema: event.dataschema ?? undefined,
    data: event.data ?? undefined,
  };
}

/**
 * Group pending deliveries by subscription (connection)
 * Returns a map of connectionId -> { deliveryIds, events }
 */
function groupBySubscription(pendingDeliveries: PendingDelivery[]): Map<
  string,
  {
    connectionId: string;
    deliveryIds: string[];
    events: CloudEvent[];
  }
> {
  const grouped = new Map<
    string,
    {
      connectionId: string;
      deliveryIds: string[];
      events: CloudEvent[];
    }
  >();

  for (const pending of pendingDeliveries) {
    const key = pending.subscription.id;
    const existing = grouped.get(key);

    if (existing) {
      existing.deliveryIds.push(pending.delivery.id);
      existing.events.push(toCloudEvent(pending.event));
    } else {
      grouped.set(key, {
        connectionId: pending.subscription.connectionId,
        deliveryIds: [pending.delivery.id],
        events: [toCloudEvent(pending.event)],
      });
    }
  }

  return grouped;
}

/**
 * EventBusWorker handles the background processing of events
 */
export class EventBusWorker {
  private running = false;
  private pollTimer: Timer | null = null;
  private config: Required<EventBusConfig>;

  constructor(
    private storage: EventBusStorage,
    private notifySubscriber: NotifySubscriberFn,
    config?: EventBusConfig,
  ) {
    this.config = { ...DEFAULT_EVENT_BUS_CONFIG, ...config };
  }

  /**
   * Start the polling loop
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.poll();
  }

  /**
   * Stop the polling loop
   */
  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Check if worker is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Trigger immediate processing (used by PostgreSQL NOTIFY)
   */
  async processNow(): Promise<void> {
    if (!this.running) return;
    await this.processEvents();
  }

  /**
   * Poll for pending events
   */
  private poll(): void {
    if (!this.running) return;

    this.processEvents()
      .catch((error) => {
        console.error("[EventBus] Error processing events:", error);
      })
      .finally(() => {
        if (this.running) {
          this.pollTimer = setTimeout(
            () => this.poll(),
            this.config.pollIntervalMs,
          );
        }
      });
  }

  /**
   * Process pending events
   */
  private async processEvents(): Promise<void> {
    // Atomically claim pending deliveries
    // This ensures only one worker processes each delivery
    const pendingDeliveries = await this.storage.claimPendingDeliveries(
      this.config.batchSize,
    );

    if (pendingDeliveries.length === 0) return;

    // Group by subscription (connection)
    const grouped = groupBySubscription(pendingDeliveries);

    // Process each subscription's batch
    const eventIdsToUpdate = new Set<string>();

    for (const [subscriptionId, batch] of grouped) {
      try {
        // Call ON_EVENTS on the subscriber connection
        const result = await this.notifySubscriber(
          batch.connectionId,
          batch.events,
        );

        if (result.success) {
          // Mark all deliveries as delivered
          await this.storage.markDeliveriesDelivered(batch.deliveryIds);
        } else {
          // Mark as failed with error
          await this.storage.markDeliveriesFailed(
            batch.deliveryIds,
            result.error || "Subscriber returned success=false",
          );
        }
      } catch (error) {
        // Network error or other failure
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[EventBus] Failed to notify subscription ${subscriptionId}:`,
          errorMessage,
        );

        await this.storage.markDeliveriesFailed(
          batch.deliveryIds,
          errorMessage,
        );
      }

      // Collect event IDs for status update
      for (const pending of pendingDeliveries) {
        if (batch.deliveryIds.includes(pending.delivery.id)) {
          eventIdsToUpdate.add(pending.event.id);
        }
      }
    }

    // Update event statuses
    for (const eventId of eventIdsToUpdate) {
      try {
        await this.storage.updateEventStatus(eventId);
      } catch (error) {
        console.error(
          `[EventBus] Failed to update event status ${eventId}:`,
          error,
        );
      }
    }
  }
}

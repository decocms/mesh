/**
 * Event Bus Worker
 *
 * Base worker implementation for processing and delivering events.
 * Handles batching events per subscriber and calling ON_EVENTS.
 */

import type { CloudEvent } from "@decocms/bindings";
import { Cron } from "croner";
import type { EventBusStorage, PendingDelivery } from "../storage/event-bus";
import type { Event } from "../storage/types";
import {
  DEFAULT_EVENT_BUS_CONFIG,
  type EventBusConfig,
  type NotifySubscriberFn,
} from "./interface";
import { createNotifySubscriber } from "./notify";

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
  private notifySubscriber: NotifySubscriberFn;
  private running = false;
  private pollTimer: Timer | null = null;
  private config: Required<EventBusConfig>;

  constructor(
    private storage: EventBusStorage,
    config?: EventBusConfig,
  ) {
    this.notifySubscriber = createNotifySubscriber();
    this.config = {
      ...DEFAULT_EVENT_BUS_CONFIG,
      ...config,
    };
  }

  /**
   * Start the polling loop
   * Also resets any stuck deliveries from previous crashes
   */
  async start(): Promise<void> {
    if (this.running) return;

    // Reset any deliveries that were stuck in 'processing' state from previous crash
    const resetCount = await this.storage.resetStuckDeliveries();
    if (resetCount > 0) {
      console.log(
        `[EventBus] Reset ${resetCount} stuck deliveries from previous shutdown`,
      );
    }

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
        } else if (result.retryAfter && result.retryAfter > 0) {
          // Subscriber wants re-delivery after a delay
          // Schedule retry WITHOUT counting toward maxAttempts
          // Subscriber must call EVENT_ACK to mark as delivered
          await this.storage.scheduleRetryWithoutAttemptIncrement(
            batch.deliveryIds,
            result.retryAfter,
          );
        } else {
          // Mark as failed with error and apply exponential backoff
          await this.storage.markDeliveriesFailed(
            batch.deliveryIds,
            result.error || "Subscriber returned success=false",
            this.config.maxAttempts,
            this.config.retryDelayMs,
            this.config.maxDelayMs,
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

        // Apply exponential backoff with config settings
        await this.storage.markDeliveriesFailed(
          batch.deliveryIds,
          errorMessage,
          this.config.maxAttempts,
          this.config.retryDelayMs,
          this.config.maxDelayMs,
        );
      }

      // Collect event IDs for status update
      for (const pending of pendingDeliveries) {
        if (batch.deliveryIds.includes(pending.delivery.id)) {
          eventIdsToUpdate.add(pending.event.id);
        }
      }
    }

    // Update event statuses and handle cron scheduling
    for (const eventId of eventIdsToUpdate) {
      try {
        await this.storage.updateEventStatus(eventId);

        // For cron events, schedule the next delivery after all current deliveries are done
        const event = pendingDeliveries.find(
          (p) => p.event.id === eventId,
        )?.event;
        if (event?.cron) {
          await this.scheduleNextCronDelivery(event);
        }
      } catch (error) {
        console.error(
          `[EventBus] Failed to update event status ${eventId}:`,
          error,
        );
      }
    }
  }

  /**
   * Schedule the next delivery for a cron event.
   * Called after all current deliveries are processed.
   */
  private async scheduleNextCronDelivery(event: Event): Promise<void> {
    if (!event.cron) return;

    // Check if the event is still active (not cancelled/failed)
    // We can't query the DB here since we don't have the latest status,
    // but the cron event was just delivered, so it should be active.
    // If it was cancelled, no new deliveries will be created.

    try {
      const cron = new Cron(event.cron);
      const nextRun = cron.nextRun();

      if (!nextRun) {
        console.log(
          `[EventBus] Cron expression for event ${event.id} has no more runs`,
        );
        return;
      }

      const nextDeliveryTime = nextRun.toISOString();

      // Get the subscriptions that match this event
      const subscriptions = await this.storage.getMatchingSubscriptions(event);
      if (subscriptions.length === 0) {
        console.log(
          `[EventBus] No subscriptions for cron event ${event.id}, skipping next delivery`,
        );
        return;
      }

      // Create new deliveries scheduled for the next cron run
      await this.storage.createDeliveries(
        event.id,
        subscriptions.map((s) => s.id),
        nextDeliveryTime,
      );

      console.log(
        `[EventBus] Scheduled next cron delivery for event ${event.id} at ${nextDeliveryTime}`,
      );
    } catch (error) {
      console.error(
        `[EventBus] Failed to schedule next cron delivery for event ${event.id}:`,
        error,
      );
    }
  }
}

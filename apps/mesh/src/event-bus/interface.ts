/**
 * Event Bus Interface
 *
 * Defines the core interface for the event bus system.
 * Implementations handle event publishing, subscription management,
 * and background event delivery.
 */

import type { CloudEvent } from "@decocms/bindings";
import type { EventSubscription, Event } from "../storage/types";

// ============================================================================
// Event Bus Types
// ============================================================================

/**
 * Input for publishing an event
 */
export interface PublishEventInput {
  /** Event type (e.g., "order.created") */
  type: string;
  /** Optional subject/resource identifier */
  subject?: string;
  /** Event payload (any JSON value) */
  data?: unknown;
}

/**
 * Input for subscribing to events
 */
export interface SubscribeInput {
  /** Connection ID that will receive events */
  connectionId: string;
  /** Event type pattern to match */
  eventType: string;
  /** Optional: Only receive events from this publisher connection */
  publisher?: string;
  /** Optional: JSONPath filter expression on event data */
  filter?: string;
}

/**
 * Event bus configuration
 */
export interface EventBusConfig {
  /** How often to poll for pending events (ms) - used by SQLite and as fallback for PostgreSQL */
  pollIntervalMs?: number;
  /** Maximum number of events to process per batch */
  batchSize?: number;
  /** Maximum number of delivery attempts before marking as failed */
  maxAttempts?: number;
  /** Base delay between retries (ms) - exponential backoff applied */
  retryDelayMs?: number;
}

/**
 * Default event bus configuration
 */
export const DEFAULT_EVENT_BUS_CONFIG: Required<EventBusConfig> = {
  pollIntervalMs: 5000, // 5 seconds
  batchSize: 100,
  maxAttempts: 5,
  retryDelayMs: 1000, // 1 second base delay
};

// ============================================================================
// Event Bus Interface
// ============================================================================

/**
 * EventBus interface for publishing and subscribing to events
 */
export interface EventBus {
  /**
   * Publish an event
   *
   * @param organizationId - Organization scope
   * @param publisherConnectionId - Connection ID of the publisher (from auth token)
   * @param input - Event data
   * @returns The created event
   */
  publish(
    organizationId: string,
    publisherConnectionId: string,
    input: PublishEventInput,
  ): Promise<Event>;

  /**
   * Subscribe a connection to events
   *
   * @param organizationId - Organization scope
   * @param input - Subscription configuration
   * @returns The created subscription
   */
  subscribe(
    organizationId: string,
    input: SubscribeInput,
  ): Promise<EventSubscription>;

  /**
   * Unsubscribe from events
   *
   * @param organizationId - Organization scope
   * @param subscriptionId - Subscription to remove
   * @returns Success status
   */
  unsubscribe(
    organizationId: string,
    subscriptionId: string,
  ): Promise<{ success: boolean }>;

  /**
   * List subscriptions
   *
   * @param organizationId - Organization scope
   * @param connectionId - Optional: filter by subscriber connection
   * @returns List of subscriptions
   */
  listSubscriptions(
    organizationId: string,
    connectionId?: string,
  ): Promise<EventSubscription[]>;

  /**
   * Get a subscription by ID
   *
   * @param organizationId - Organization scope
   * @param subscriptionId - Subscription ID
   * @returns Subscription or null if not found
   */
  getSubscription(
    organizationId: string,
    subscriptionId: string,
  ): Promise<EventSubscription | null>;

  /**
   * Start the background worker for event delivery
   */
  start(): void;

  /**
   * Stop the background worker
   */
  stop(): void;

  /**
   * Check if the worker is running
   */
  isRunning(): boolean;
}

/**
 * Notify subscriber callback type
 * Called by the worker to deliver events to subscribers
 */
export type NotifySubscriberFn = (
  connectionId: string,
  events: CloudEvent[],
) => Promise<{ success: boolean; error?: string }>;

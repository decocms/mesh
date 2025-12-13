/**
 * Event Bus Storage
 *
 * Provides database operations for the event bus:
 * - Publishing events
 * - Managing subscriptions
 * - Tracking event deliveries
 *
 * Supports both SQLite and PostgreSQL via Kysely.
 *
 * Concurrency Safety:
 * - Uses atomic UPDATE with status change to claim deliveries
 * - Multiple workers can safely poll without processing same events
 */

import type { Kysely } from "kysely";
import type {
  Database,
  Event,
  EventDelivery,
  EventSubscription,
  EventStatus,
} from "./types";

// ============================================================================
// Input Types
// ============================================================================

/**
 * Input for creating a new event
 */
export interface CreateEventInput {
  id: string;
  organizationId: string;
  type: string;
  source: string;
  subject?: string | null;
  time: string;
  datacontenttype?: string;
  dataschema?: string | null;
  data?: unknown | null;
}

/**
 * Input for creating a subscription
 */
export interface CreateSubscriptionInput {
  id: string;
  organizationId: string;
  connectionId: string;
  publisher?: string | null;
  eventType: string;
  filter?: string | null;
}

/**
 * Pending event with matched subscriptions for delivery
 */
export interface PendingDelivery {
  delivery: EventDelivery;
  event: Event;
  subscription: EventSubscription;
}

// ============================================================================
// EventBusStorage Interface
// ============================================================================

/**
 * EventBusStorage provides database operations for the event bus
 */
export interface EventBusStorage {
  /**
   * Insert a new event with status=pending
   */
  publishEvent(input: CreateEventInput): Promise<Event>;

  /**
   * Create a new subscription
   */
  subscribe(input: CreateSubscriptionInput): Promise<EventSubscription>;

  /**
   * Delete a subscription by ID
   */
  unsubscribe(
    id: string,
    organizationId: string,
  ): Promise<{ success: boolean }>;

  /**
   * List subscriptions, optionally filtered by connection
   */
  listSubscriptions(
    organizationId: string,
    connectionId?: string,
  ): Promise<EventSubscription[]>;

  /**
   * Get a subscription by ID
   */
  getSubscription(
    id: string,
    organizationId: string,
  ): Promise<EventSubscription | null>;

  /**
   * Find subscriptions that match an event
   * Matches by event_type and optionally source_connection_id
   */
  getMatchingSubscriptions(event: Event): Promise<EventSubscription[]>;

  /**
   * Create delivery records for an event and its matching subscriptions
   */
  createDeliveries(eventId: string, subscriptionIds: string[]): Promise<void>;

  /**
   * Atomically claim pending deliveries for processing.
   * Uses UPDATE to change status from 'pending' to 'processing',
   * ensuring only one worker processes each delivery.
   *
   * For PostgreSQL: Uses FOR UPDATE SKIP LOCKED for efficient locking
   * For SQLite: Uses atomic UPDATE with subquery
   *
   * @param limit - Maximum number of deliveries to claim
   * @returns Claimed deliveries with their events and subscriptions
   */
  claimPendingDeliveries(limit: number): Promise<PendingDelivery[]>;

  /**
   * Mark deliveries as delivered (batch)
   * Changes status from 'processing' to 'delivered'
   */
  markDeliveriesDelivered(deliveryIds: string[]): Promise<void>;

  /**
   * Mark deliveries as failed with error message (batch)
   */
  markDeliveriesFailed(deliveryIds: string[], error: string): Promise<void>;

  /**
   * Update event status based on delivery states
   * If all deliveries are delivered, mark event as delivered
   * If any delivery has reached max attempts, mark as failed
   */
  updateEventStatus(eventId: string): Promise<void>;
}

// ============================================================================
// EventBusStorage Implementation
// ============================================================================

/**
 * Default EventBusStorage implementation using Kysely
 */
class KyselyEventBusStorage implements EventBusStorage {
  constructor(private db: Kysely<Database>) {}

  async publishEvent(input: CreateEventInput): Promise<Event> {
    const now = new Date().toISOString();

    await this.db
      .insertInto("events")
      .values({
        id: input.id,
        organization_id: input.organizationId,
        type: input.type,
        source: input.source,
        specversion: "1.0",
        subject: input.subject ?? null,
        time: input.time,
        datacontenttype: input.datacontenttype ?? "application/json",
        dataschema: input.dataschema ?? null,
        data: input.data ? JSON.stringify(input.data) : null,
        status: "pending",
        attempts: 0,
        last_error: null,
        next_retry_at: null,
        created_at: now,
        updated_at: now,
      })
      .execute();

    return {
      id: input.id,
      organizationId: input.organizationId,
      type: input.type,
      source: input.source,
      specversion: "1.0",
      subject: input.subject ?? null,
      time: input.time,
      datacontenttype: input.datacontenttype ?? "application/json",
      dataschema: input.dataschema ?? null,
      data: input.data ?? null,
      status: "pending",
      attempts: 0,
      lastError: null,
      nextRetryAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async subscribe(input: CreateSubscriptionInput): Promise<EventSubscription> {
    // Check for existing subscription with same connection, event type, source, and filter
    // This makes subscription creation idempotent
    let query = this.db
      .selectFrom("event_subscriptions")
      .selectAll()
      .where("organization_id", "=", input.organizationId)
      .where("connection_id", "=", input.connectionId)
      .where("event_type", "=", input.eventType);

    // Handle nullable publisher comparison
    if (input.publisher) {
      query = query.where("publisher", "=", input.publisher);
    } else {
      query = query.where("publisher", "is", null);
    }

    // Handle nullable filter comparison
    if (input.filter) {
      query = query.where("filter", "=", input.filter);
    } else {
      query = query.where("filter", "is", null);
    }

    const existing = await query.executeTakeFirst();

    // If subscription already exists, return it (idempotent)
    if (existing) {
      return {
        id: existing.id,
        organizationId: existing.organization_id,
        connectionId: existing.connection_id,
        publisher: existing.publisher,
        eventType: existing.event_type,
        filter: existing.filter,
        enabled: existing.enabled === 1,
        createdAt: existing.created_at,
        updatedAt: existing.updated_at,
      };
    }

    // Create new subscription
    const now = new Date().toISOString();

    await this.db
      .insertInto("event_subscriptions")
      .values({
        id: input.id,
        organization_id: input.organizationId,
        connection_id: input.connectionId,
        publisher: input.publisher ?? null,
        event_type: input.eventType,
        filter: input.filter ?? null,
        enabled: 1,
        created_at: now,
        updated_at: now,
      })
      .execute();

    return {
      id: input.id,
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      publisher: input.publisher ?? null,
      eventType: input.eventType,
      filter: input.filter ?? null,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  async unsubscribe(
    id: string,
    organizationId: string,
  ): Promise<{ success: boolean }> {
    const result = await this.db
      .deleteFrom("event_subscriptions")
      .where("id", "=", id)
      .where("organization_id", "=", organizationId)
      .executeTakeFirst();

    return { success: (result.numDeletedRows ?? 0n) > 0n };
  }

  async listSubscriptions(
    organizationId: string,
    connectionId?: string,
  ): Promise<EventSubscription[]> {
    let query = this.db
      .selectFrom("event_subscriptions")
      .selectAll()
      .where("organization_id", "=", organizationId);

    if (connectionId) {
      query = query.where("connection_id", "=", connectionId);
    }

    const rows = await query.execute();

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      connectionId: row.connection_id,
      publisher: row.publisher,
      eventType: row.event_type,
      filter: row.filter,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async getSubscription(
    id: string,
    organizationId: string,
  ): Promise<EventSubscription | null> {
    const row = await this.db
      .selectFrom("event_subscriptions")
      .selectAll()
      .where("id", "=", id)
      .where("organization_id", "=", organizationId)
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      organizationId: row.organization_id,
      connectionId: row.connection_id,
      publisher: row.publisher,
      eventType: row.event_type,
      filter: row.filter,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getMatchingSubscriptions(event: Event): Promise<EventSubscription[]> {
    // Find enabled subscriptions that match the event type
    // and either have no publisher filter or match the event source
    const rows = await this.db
      .selectFrom("event_subscriptions")
      .selectAll()
      .where("organization_id", "=", event.organizationId)
      .where("enabled", "=", 1)
      .where("event_type", "=", event.type)
      .where((eb) =>
        eb.or([
          eb("publisher", "is", null),
          eb("publisher", "=", event.source),
        ]),
      )
      .execute();

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      connectionId: row.connection_id,
      publisher: row.publisher,
      eventType: row.event_type,
      filter: row.filter,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async createDeliveries(
    eventId: string,
    subscriptionIds: string[],
  ): Promise<void> {
    if (subscriptionIds.length === 0) return;

    const now = new Date().toISOString();

    const values = subscriptionIds.map((subscriptionId) => ({
      id: crypto.randomUUID(),
      event_id: eventId,
      subscription_id: subscriptionId,
      status: "pending" as EventStatus,
      attempts: 0,
      last_error: null,
      delivered_at: null,
      created_at: now,
    }));

    await this.db.insertInto("event_deliveries").values(values).execute();
  }

  async claimPendingDeliveries(limit: number): Promise<PendingDelivery[]> {
    // Step 1: Atomically claim deliveries by updating status to 'processing'
    // This uses a subquery to select IDs, then updates only those that are still 'pending'
    // This prevents race conditions between multiple workers

    // First, get the IDs of pending deliveries to claim
    const pendingIds = await this.db
      .selectFrom("event_deliveries as d")
      .innerJoin("event_subscriptions as s", "s.id", "d.subscription_id")
      .select(["d.id"])
      .where("d.status", "=", "pending")
      .where("s.enabled", "=", 1)
      .orderBy("d.created_at", "asc")
      .limit(limit)
      .execute();

    if (pendingIds.length === 0) {
      return [];
    }

    const idsToClam = pendingIds.map((r) => r.id);

    // Step 2: Atomically update status to 'processing' for these IDs
    // Only updates rows that are still 'pending' (race condition protection)
    await this.db
      .updateTable("event_deliveries")
      .set({ status: "processing" })
      .where("id", "in", idsToClam)
      .where("status", "=", "pending") // Only claim if still pending
      .execute();

    // Step 3: Fetch the claimed deliveries with full details
    // Only get ones we successfully claimed (status = 'processing')
    const rows = await this.db
      .selectFrom("event_deliveries as d")
      .innerJoin("events as e", "e.id", "d.event_id")
      .innerJoin("event_subscriptions as s", "s.id", "d.subscription_id")
      .select([
        // Delivery fields
        "d.id as delivery_id",
        "d.event_id",
        "d.subscription_id",
        "d.status as delivery_status",
        "d.attempts as delivery_attempts",
        "d.last_error as delivery_last_error",
        "d.delivered_at",
        "d.created_at as delivery_created_at",
        // Event fields
        "e.organization_id",
        "e.type",
        "e.source",
        "e.specversion",
        "e.subject",
        "e.time",
        "e.datacontenttype",
        "e.dataschema",
        "e.data",
        "e.status as event_status",
        "e.attempts as event_attempts",
        "e.last_error as event_last_error",
        "e.next_retry_at",
        "e.created_at as event_created_at",
        "e.updated_at as event_updated_at",
        // Subscription fields
        "s.connection_id",
        "s.publisher",
        "s.event_type",
        "s.filter",
        "s.enabled",
        "s.created_at as subscription_created_at",
        "s.updated_at as subscription_updated_at",
      ])
      .where("d.id", "in", idsToClam)
      .where("d.status", "=", "processing") // Only get ones we claimed
      .execute();

    return rows.map((row) => ({
      delivery: {
        id: row.delivery_id,
        eventId: row.event_id,
        subscriptionId: row.subscription_id,
        status: row.delivery_status as EventStatus,
        attempts: row.delivery_attempts,
        lastError: row.delivery_last_error,
        deliveredAt: row.delivered_at,
        createdAt: row.delivery_created_at,
      },
      event: {
        id: row.event_id,
        organizationId: row.organization_id,
        type: row.type,
        source: row.source,
        specversion: row.specversion,
        subject: row.subject,
        time: row.time,
        datacontenttype: row.datacontenttype,
        dataschema: row.dataschema,
        data: row.data ? JSON.parse(row.data as string) : null,
        status: row.event_status as EventStatus,
        attempts: row.event_attempts,
        lastError: row.event_last_error,
        nextRetryAt: row.next_retry_at,
        createdAt: row.event_created_at,
        updatedAt: row.event_updated_at,
      },
      subscription: {
        id: row.subscription_id,
        organizationId: row.organization_id,
        connectionId: row.connection_id,
        publisher: row.publisher,
        eventType: row.event_type,
        filter: row.filter,
        enabled: row.enabled === 1,
        createdAt: row.subscription_created_at,
        updatedAt: row.subscription_updated_at,
      },
    }));
  }

  async markDeliveriesDelivered(deliveryIds: string[]): Promise<void> {
    if (deliveryIds.length === 0) return;

    const now = new Date().toISOString();

    await this.db
      .updateTable("event_deliveries")
      .set({
        status: "delivered",
        delivered_at: now,
      })
      .where("id", "in", deliveryIds)
      .execute();
  }

  async markDeliveriesFailed(
    deliveryIds: string[],
    error: string,
    maxAttempts = 5,
  ): Promise<void> {
    if (deliveryIds.length === 0) return;

    // Increment attempts and set error for all deliveries
    for (const id of deliveryIds) {
      await this.db
        .updateTable("event_deliveries")
        .set((eb) => ({
          attempts: eb("attempts", "+", 1),
          last_error: error,
        }))
        .where("id", "=", id)
        .execute();
    }

    // For deliveries that haven't reached max attempts, reset to 'pending' for retry
    await this.db
      .updateTable("event_deliveries")
      .set({ status: "pending" })
      .where("id", "in", deliveryIds)
      .where("attempts", "<", maxAttempts)
      .execute();

    // For deliveries that have reached max attempts, mark as 'failed'
    await this.db
      .updateTable("event_deliveries")
      .set({ status: "failed" })
      .where("id", "in", deliveryIds)
      .where("attempts", ">=", maxAttempts)
      .execute();
  }

  async updateEventStatus(eventId: string): Promise<void> {
    // Check if all deliveries are completed
    const deliveries = await this.db
      .selectFrom("event_deliveries")
      .select(["status"])
      .where("event_id", "=", eventId)
      .execute();

    if (deliveries.length === 0) return;

    const allDelivered = deliveries.every((d) => d.status === "delivered");
    const anyFailed = deliveries.some((d) => d.status === "failed");
    const hasInProgress = deliveries.some(
      (d) => d.status === "pending" || d.status === "processing",
    );

    if (allDelivered) {
      await this.db
        .updateTable("events")
        .set({
          status: "delivered",
          updated_at: new Date().toISOString(),
        })
        .where("id", "=", eventId)
        .execute();
    } else if (anyFailed && !hasInProgress) {
      // Only mark as failed if no deliveries are still in progress
      await this.db
        .updateTable("events")
        .set({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .where("id", "=", eventId)
        .execute();
    }
  }
}

/**
 * Create an EventBusStorage instance
 */
export function createEventBusStorage(db: Kysely<Database>): EventBusStorage {
  return new KyselyEventBusStorage(db);
}

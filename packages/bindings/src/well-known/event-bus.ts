/**
 * Event Bus Well-Known Binding
 *
 * Defines the interface for interacting with an event bus via MCP.
 * Any MCP that implements this binding can publish events and manage subscriptions.
 *
 * This binding includes:
 * - EVENT_PUBLISH: Publish an event to the bus
 * - EVENT_SUBSCRIBE: Subscribe to events of a specific type
 * - EVENT_UNSUBSCRIBE: Remove a subscription
 *
 * Events follow the CloudEvents v1.0 specification.
 * @see https://cloudevents.io/
 */

import { z } from "zod";
import { bindingClient, type ToolBinder } from "../core/binder";

// ============================================================================
// Publish Schemas
// ============================================================================

/**
 * EVENT_PUBLISH Input Schema
 *
 * Input for publishing an event.
 * Note: `source` is automatically set by the event bus from the caller's connection ID.
 */
export const EventPublishInputSchema = z.object({
  /** Event type (e.g., "order.created", "user.signup") */
  type: z.string().min(1).max(255).describe("Event type identifier"),

  /** Optional subject/resource identifier */
  subject: z
    .string()
    .max(255)
    .optional()
    .describe("Subject/resource identifier (e.g., order ID)"),

  /** Event payload (any JSON value) */
  data: z.unknown().optional().describe("Event payload"),

  /**
   * Optional scheduled delivery time (ISO 8601 timestamp).
   * If provided, the event will not be delivered until this time.
   * If omitted, the event is delivered immediately.
   * Cannot be used together with `cron`.
   */
  deliverAt: z
    .string()
    .datetime()
    .optional()
    .describe(
      "Scheduled delivery time (ISO 8601). Omit for immediate delivery.",
    ),

  /**
   * Optional cron expression for recurring events.
   * If provided, the event will be delivered repeatedly according to the schedule.
   * Uses standard cron syntax (5 or 6 fields).
   * Cannot be used together with `deliverAt`.
   *
   * Examples:
   * - "0 9 * * 1" - Every Monday at 9:00 AM
   * - "0 0 1 * *" - First day of every month at midnight
   * - "0/15 * * * *" - Every 15 minutes
   */
  cron: z
    .string()
    .max(100)
    .optional()
    .describe(
      "Cron expression for recurring delivery. Use EVENT_CANCEL to stop.",
    ),
});

export type EventPublishInput = z.infer<typeof EventPublishInputSchema>;

/**
 * EVENT_PUBLISH Output Schema
 */
export const EventPublishOutputSchema = z.object({
  /** Created event ID */
  id: z.string().describe("Unique event ID"),

  /** Event type */
  type: z.string().describe("Event type"),

  /** Source connection ID */
  source: z.string().describe("Source connection ID"),

  /** Event timestamp (ISO 8601) */
  time: z.string().describe("Event timestamp"),
});

export type EventPublishOutput = z.infer<typeof EventPublishOutputSchema>;

// ============================================================================
// Subscribe Schemas
// ============================================================================

/**
 * EVENT_SUBSCRIBE Input Schema
 *
 * Input for subscribing to events.
 * The subscriber connection ID is automatically set from the caller's token.
 */
export const EventSubscribeInputSchema = z.object({
  /** Event type pattern to match */
  eventType: z.string().min(1).max(255).describe("Event type to subscribe to"),

  /** Optional: Only receive events from this publisher connection */
  publisher: z
    .string()
    .optional()
    .describe("Filter events by publisher connection ID"),

  /** Optional: JSONPath filter expression on event data */
  filter: z
    .string()
    .max(1000)
    .optional()
    .describe("JSONPath filter expression on event data"),

  /**
   * Optional: Override the subscriber connection ID.
   * When calling through a gateway, use this to specify which connection
   * should receive the events (defaults to the caller's connection ID).
   */
  subscriberId: z
    .string()
    .optional()
    .describe(
      "Override subscriber connection ID (for subscriptions via gateway)",
    ),
});

export type EventSubscribeInput = z.infer<typeof EventSubscribeInputSchema>;

/**
 * EVENT_SUBSCRIBE Output Schema
 */
export const EventSubscribeOutputSchema = z.object({
  /** Created subscription */
  subscription: z.object({
    /** Subscription ID */
    id: z.string().describe("Subscription ID"),

    /** Subscriber connection ID */
    connectionId: z.string().describe("Subscriber connection ID"),

    /** Event type pattern */
    eventType: z.string().describe("Event type pattern"),

    /** Publisher connection filter */
    publisher: z.string().nullable().describe("Publisher connection filter"),

    /** JSONPath filter */
    filter: z.string().nullable().describe("JSONPath filter expression"),

    /** Whether subscription is enabled */
    enabled: z.boolean().describe("Whether subscription is enabled"),

    /** Created timestamp */
    createdAt: z.union([z.string(), z.date()]).describe("Created timestamp"),

    /** Updated timestamp */
    updatedAt: z.union([z.string(), z.date()]).describe("Updated timestamp"),
  }),
});

export type EventSubscribeOutput = z.infer<typeof EventSubscribeOutputSchema>;

// ============================================================================
// Sync Subscriptions Schemas
// ============================================================================

/**
 * Subscription item schema for sync operations
 */
export const SubscriptionItemSchema = z.object({
  /** Event type pattern to match */
  eventType: z.string().min(1).max(255).describe("Event type to subscribe to"),

  /** Optional: Only receive events from this publisher connection */
  publisher: z
    .string()
    .optional()
    .describe("Filter events by publisher connection ID"),

  /** Optional: JSONPath filter expression on event data */
  filter: z
    .string()
    .max(1000)
    .optional()
    .describe("JSONPath filter expression on event data"),
});

export type SubscriptionItem = z.infer<typeof SubscriptionItemSchema>;

/**
 * Subscription detail schema (returned in responses)
 */
export const SubscriptionDetailSchema = z.object({
  /** Subscription ID */
  id: z.string().describe("Subscription ID"),

  /** Subscriber connection ID */
  connectionId: z.string().describe("Subscriber connection ID"),

  /** Event type pattern */
  eventType: z.string().describe("Event type pattern"),

  /** Publisher connection filter */
  publisher: z.string().nullable().describe("Publisher connection filter"),

  /** JSONPath filter */
  filter: z.string().nullable().describe("JSONPath filter expression"),

  /** Whether subscription is enabled */
  enabled: z.boolean().describe("Whether subscription is enabled"),

  /** Created timestamp */
  createdAt: z.union([z.string(), z.date()]).describe("Created timestamp"),

  /** Updated timestamp */
  updatedAt: z.union([z.string(), z.date()]).describe("Updated timestamp"),
});

export type SubscriptionDetail = z.infer<typeof SubscriptionDetailSchema>;

/**
 * EVENT_SYNC_SUBSCRIPTIONS Input Schema
 *
 * Input for syncing subscriptions to a desired state.
 * The system will create new, delete removed, and update changed subscriptions.
 * Subscriptions are identified by (eventType, publisher) - only one subscription
 * per combination is allowed.
 */
export const EventSyncSubscriptionsInputSchema = z.object({
  /** Desired subscriptions - system will create/update/delete to match */
  subscriptions: z
    .array(SubscriptionItemSchema)
    .describe(
      "Desired subscriptions - system will create/update/delete to match",
    ),
});

export type EventSyncSubscriptionsInput = z.infer<
  typeof EventSyncSubscriptionsInputSchema
>;

/**
 * EVENT_SYNC_SUBSCRIPTIONS Output Schema
 */
export const EventSyncSubscriptionsOutputSchema = z.object({
  /** Number of new subscriptions created */
  created: z.number().int().min(0).describe("Number of subscriptions created"),

  /** Number of subscriptions with filter updated */
  updated: z
    .number()
    .int()
    .min(0)
    .describe("Number of subscriptions with filter updated"),

  /** Number of old subscriptions removed */
  deleted: z.number().int().min(0).describe("Number of subscriptions removed"),

  /** Number of subscriptions unchanged */
  unchanged: z
    .number()
    .int()
    .min(0)
    .describe("Number of subscriptions unchanged"),

  /** Current subscriptions after sync */
  subscriptions: z
    .array(SubscriptionDetailSchema)
    .describe("Current subscriptions after sync"),
});

export type EventSyncSubscriptionsOutput = z.infer<
  typeof EventSyncSubscriptionsOutputSchema
>;

// ============================================================================
// Unsubscribe Schemas
// ============================================================================

/**
 * EVENT_UNSUBSCRIBE Input Schema
 */
export const EventUnsubscribeInputSchema = z.object({
  /** Subscription ID to remove */
  subscriptionId: z.string().describe("Subscription ID to remove"),
});

export type EventUnsubscribeInput = z.infer<typeof EventUnsubscribeInputSchema>;

/**
 * EVENT_UNSUBSCRIBE Output Schema
 */
export const EventUnsubscribeOutputSchema = z.object({
  /** Success status */
  success: z.boolean().describe("Whether unsubscribe was successful"),

  /** Subscription ID that was removed */
  subscriptionId: z.string().describe("Subscription ID that was removed"),
});

export type EventUnsubscribeOutput = z.infer<
  typeof EventUnsubscribeOutputSchema
>;

// ============================================================================
// Cancel Schemas (for stopping recurring events)
// ============================================================================

/**
 * EVENT_CANCEL Input Schema
 *
 * Input for cancelling a recurring event.
 * Only the publisher connection can cancel its own events.
 */
export const EventCancelInputSchema = z.object({
  /** Event ID to cancel */
  eventId: z.string().describe("Event ID to cancel"),
});

export type EventCancelInput = z.infer<typeof EventCancelInputSchema>;

/**
 * EVENT_CANCEL Output Schema
 */
export const EventCancelOutputSchema = z.object({
  /** Success status */
  success: z.boolean().describe("Whether cancellation was successful"),

  /** Event ID that was cancelled */
  eventId: z.string().describe("Event ID that was cancelled"),
});

export type EventCancelOutput = z.infer<typeof EventCancelOutputSchema>;

// ============================================================================
// Ack Schemas (for acknowledging async event processing)
// ============================================================================

/**
 * EVENT_ACK Input Schema
 *
 * Input for acknowledging an event delivery.
 * Used when ON_EVENTS returns retryAfter - the subscriber must call EVENT_ACK
 * to confirm successful processing, otherwise the event will be re-delivered.
 *
 * The subscriber connection ID is determined from the caller's token.
 */
export const EventAckInputSchema = z.object({
  /** Event ID to acknowledge */
  eventId: z.string().describe("Event ID to acknowledge"),
});

export type EventAckInput = z.infer<typeof EventAckInputSchema>;

/**
 * EVENT_ACK Output Schema
 */
export const EventAckOutputSchema = z.object({
  /** Success status */
  success: z.boolean().describe("Whether ACK was successful"),

  /** Event ID that was acknowledged */
  eventId: z.string().describe("Event ID that was acknowledged"),
});

export type EventAckOutput = z.infer<typeof EventAckOutputSchema>;

// ============================================================================
// Event Bus Binding
// ============================================================================

/**
 * Event Bus Binding
 *
 * Defines the interface for interacting with an event bus.
 * Implementations must provide PUBLISH, SUBSCRIBE, UNSUBSCRIBE, CANCEL, ACK, and SYNC_SUBSCRIPTIONS tools.
 *
 * Required tools:
 * - EVENT_PUBLISH: Publish an event (supports one-time, scheduled, and recurring via cron)
 * - EVENT_SUBSCRIBE: Subscribe to events
 * - EVENT_UNSUBSCRIBE: Remove a subscription
 * - EVENT_CANCEL: Cancel a recurring event (stops future deliveries)
 * - EVENT_ACK: Acknowledge event delivery (for async processing with retryAfter)
 * - EVENT_SYNC_SUBSCRIPTIONS: Sync subscriptions to desired state
 */
export const EVENT_BUS_BINDING = [
  {
    name: "EVENT_PUBLISH" as const,
    inputSchema: EventPublishInputSchema,
    outputSchema: EventPublishOutputSchema,
  },
  {
    name: "EVENT_SUBSCRIBE" as const,
    inputSchema: EventSubscribeInputSchema,
    outputSchema: EventSubscribeOutputSchema,
  },
  {
    name: "EVENT_UNSUBSCRIBE" as const,
    inputSchema: EventUnsubscribeInputSchema,
    outputSchema: EventUnsubscribeOutputSchema,
  },
  {
    name: "EVENT_CANCEL" as const,
    inputSchema: EventCancelInputSchema,
    outputSchema: EventCancelOutputSchema,
  },
  {
    name: "EVENT_ACK" as const,
    inputSchema: EventAckInputSchema,
    outputSchema: EventAckOutputSchema,
  },
  {
    name: "EVENT_SYNC_SUBSCRIPTIONS" as const,
    inputSchema: EventSyncSubscriptionsInputSchema,
    outputSchema: EventSyncSubscriptionsOutputSchema,
  },
] satisfies ToolBinder[];

/**
 * Event Bus Binding Client
 *
 * Use this to create a client for interacting with an event bus.
 *
 * @example
 * ```typescript
 * import { EventBusBinding } from "@decocms/bindings/event-bus";
 *
 * // For a connection
 * const client = EventBusBinding.forConnection(connection);
 *
 * // Publish an event
 * const event = await client.EVENT_PUBLISH({
 *   type: "order.created",
 *   data: { orderId: "123" }
 * });
 *
 * // Subscribe to events
 * const sub = await client.EVENT_SUBSCRIBE({
 *   eventType: "order.created"
 * });
 *
 * // Unsubscribe
 * await client.EVENT_UNSUBSCRIBE({
 *   subscriptionId: sub.subscription.id
 * });
 * ```
 */
export const EventBusBinding = bindingClient(EVENT_BUS_BINDING);

/**
 * Type helper for the Event Bus binding client
 */
export type EventBusBindingClient = ReturnType<
  typeof EventBusBinding.forConnection
>;

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
// Event Bus Binding
// ============================================================================

/**
 * Event Bus Binding
 *
 * Defines the interface for interacting with an event bus.
 * Implementations must provide PUBLISH, SUBSCRIBE, and UNSUBSCRIBE tools.
 *
 * Required tools:
 * - EVENT_PUBLISH: Publish an event
 * - EVENT_SUBSCRIBE: Subscribe to events
 * - EVENT_UNSUBSCRIBE: Remove a subscription
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

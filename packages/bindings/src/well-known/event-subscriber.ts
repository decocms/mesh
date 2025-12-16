/**
 * Event Subscriber Well-Known Binding
 *
 * Defines the interface for MCP connections that can receive events.
 * Any MCP that implements this binding can receive batched CloudEvents
 * from the MCP Mesh event bus.
 *
 * This binding includes:
 * - ON_EVENTS: Receive a batch of CloudEvents
 *
 * Events follow the CloudEvents v1.0 specification.
 * @see https://cloudevents.io/
 */

import { z } from "zod";
import { bindingClient, type ToolBinder } from "../core/binder";

/**
 * CloudEvent Schema
 *
 * Follows CloudEvents v1.0 specification.
 * Required attributes: id, source, type, specversion
 * Optional attributes: time, subject, datacontenttype, dataschema, data
 *
 * @see https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md
 */
export const CloudEventSchema = z.object({
  /** CloudEvents specification version (always "1.0") */
  specversion: z.literal("1.0").describe("CloudEvents specification version"),

  /** Unique identifier for this event */
  id: z
    .string()
    .describe("Unique identifier for this event (UUID recommended)"),

  /**
   * Source of the event - in MCP Mesh, this is the connection ID of the publisher.
   * Format: URI-reference identifying the context in which an event happened.
   */
  source: z.string().describe("Connection ID of the event publisher"),

  /**
   * Event type identifier.
   * Should be a reverse-DNS name like "com.example.order.created"
   */
  type: z
    .string()
    .describe("Event type (e.g., 'order.created', 'user.signup')"),

  /** Timestamp of when the event occurred (ISO 8601 format) */
  time: z
    .string()
    .datetime()
    .optional()
    .describe("Timestamp of when the event occurred (ISO 8601)"),

  /**
   * Subject of the event in the context of the event producer.
   * Can be used to identify the resource the event is about.
   */
  subject: z
    .string()
    .optional()
    .describe("Subject/resource identifier (e.g., order ID, user ID)"),

  /** Content type of the data attribute (e.g., "application/json") */
  datacontenttype: z
    .string()
    .optional()
    .default("application/json")
    .describe("Content type of the data attribute"),

  /** Schema URI for the data attribute */
  dataschema: z
    .string()
    .url()
    .optional()
    .describe("URI to the schema for the data attribute"),

  /** Event payload - can be any JSON value */
  data: z.unknown().optional().describe("Event payload (any JSON value)"),
});

/**
 * CloudEvent type - inferred from schema
 */
export type CloudEvent = z.infer<typeof CloudEventSchema>;

/**
 * ON_EVENTS Input Schema
 *
 * Accepts a batch of CloudEvents for processing.
 */
export const OnEventsInputSchema = z.object({
  /** Array of CloudEvents to process */
  events: z
    .array(CloudEventSchema)
    .min(1)
    .describe("Batch of CloudEvents to process"),
});

/**
 * ON_EVENTS Input type
 */
export type OnEventsInput = z.infer<typeof OnEventsInputSchema>;

/**
 * ON_EVENTS Output Schema
 *
 * Returns success status. If success=true, all events in the batch
 * are considered delivered and will be marked as such by the event bus.
 */
export const OnEventsOutputSchema = z.object({
  /** Whether all events were successfully processed */
  success: z
    .boolean()
    .describe("True if all events were successfully processed"),

  /** Optional error message if success=false */
  error: z.string().optional().describe("Error message if processing failed"),

  /** Optional count of successfully processed events */
  processedCount: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of events successfully processed"),
});

/**
 * ON_EVENTS Output type
 */
export type OnEventsOutput = z.infer<typeof OnEventsOutputSchema>;

/**
 * Event Subscriber Binding
 *
 * Defines the interface for MCP connections that can receive events.
 * Implementations must provide the ON_EVENTS tool to receive batched CloudEvents.
 *
 * Required tools:
 * - ON_EVENTS: Receive and process a batch of CloudEvents
 */
export const EVENT_SUBSCRIBER_BINDING = [
  {
    name: "ON_EVENTS" as const,
    inputSchema: OnEventsInputSchema,
    outputSchema: OnEventsOutputSchema,
  },
] satisfies ToolBinder[];

/**
 * Event Subscriber Binding Client
 *
 * Use this to create a client for calling ON_EVENTS on subscriber connections.
 *
 * @example
 * ```typescript
 * import { EventSubscriberBinding } from "@decocms/bindings/event-subscriber";
 *
 * // For a connection
 * const client = EventSubscriberBinding.forConnection(connection);
 * const result = await client.ON_EVENTS({ events: [...] });
 *
 * // For an MCP client
 * const client = EventSubscriberBinding.forClient(mcpClient);
 * const result = await client.ON_EVENTS({ events: [...] });
 * ```
 */
export const EventSubscriberBinding = bindingClient(EVENT_SUBSCRIBER_BINDING);

/**
 * Type helper for the Event Subscriber binding client
 */
export type EventSubscriberBindingClient = ReturnType<
  typeof EventSubscriberBinding.forConnection
>;

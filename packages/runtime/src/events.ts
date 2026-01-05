import type {
  CloudEvent,
  EventResult,
  OnEventsOutput,
} from "@decocms/bindings";
import { z } from "zod";
import { isBinding } from "./bindings.ts";

// ============================================================================
// Constants
// ============================================================================

/**
 * SELF is a well-known property key for event handlers that represents
 * the current connection. When used, subscriptions are created with the
 * current connection's ID as the publisher.
 */
export const SELF = "SELF" as const;

// ============================================================================
// Types
// ============================================================================

export interface EventSubscription {
  eventType: string;
  publisher: string;
}

/**
 * Per-event handler - handles events of a specific type
 * Returns result for each event individually
 */
export type PerEventHandler<TEnv> = (
  context: { events: CloudEvent[] },
  env: TEnv,
) => EventResult | Promise<EventResult>;

/**
 * Batch handler function - handles multiple events at once
 * Can return batch result or per-event results
 */
export type BatchHandlerFn<TEnv> = (
  context: { events: CloudEvent[] },
  env: TEnv,
) => OnEventsOutput | Promise<OnEventsOutput>;

/**
 * Batch handler with explicit event types for subscription.
 *
 * When used as a global handler, events must be prefixed with binding name:
 * - "SELF::order.created" - subscribe to order.created from current connection
 * - "DATABASE::record.updated" - subscribe to record.updated from DATABASE binding
 *
 * @example
 * ```ts
 * {
 *   handler: async ({ events }, env) => ({ success: true }),
 *   events: ["SELF::order.created", "DATABASE::record.updated"]
 * }
 * ```
 */
export interface BatchHandler<TEnv> {
  /** Handler function */
  handler: BatchHandlerFn<TEnv>;
  /**
   * Event types to subscribe to.
   * Format: "BINDING::EVENT_TYPE" (e.g., "SELF::order.created")
   */
  events: string[];
}

/**
 * Binding-level handlers - either a batch handler with events or per-event handlers
 *
 * @example Per-event handlers (event types inferred from keys)
 * ```ts
 * { "order.created": handler, "order.updated": handler }
 * ```
 *
 * @example Batch handler with explicit events
 * ```ts
 * { handler: fn, events: ["order.created", "order.updated"] }
 * ```
 */
export type BindingHandlers<TEnv, Binding = unknown> =
  | BatchHandler<TEnv>
  | (Record<string, PerEventHandler<TEnv>> & CronHandlers<Binding, TEnv>);

export type CronHandlers<Binding, Env = unknown> = Binding extends {
  __type: "@deco/event-bus";
  value: string;
}
  ? {
      [key in `cron/${string}`]: (env: Env) => Promise<void>;
    }
  : {};
/**
 * Handlers for SELF - the current connection.
 * SELF handlers can subscribe to any event type, including cron events.
 */
export type SelfHandlers<TEnv> =
  | BatchHandler<TEnv>
  | (Record<string, PerEventHandler<TEnv>> & {
      [key in `cron/${string}`]?: (env: TEnv) => Promise<void>;
    });

/**
 * EventHandlers type supports four handler formats:
 *
 * @example Global handler with prefixed events (BINDING::EVENT_TYPE)
 * ```ts
 * {
 *   handler: (ctx, env) => result,
 *   events: ["SELF::order.created", "DATABASE::record.updated"]
 * }
 * ```
 *
 * @example Per-binding batch handler
 * ```ts
 * { DATABASE: { handler: fn, events: ["order.created"] } }
 * ```
 *
 * @example Per-event handlers (events inferred from keys)
 * ```ts
 * { DATABASE: { "order.created": (ctx, env) => result } }
 * ```
 *
 * @example SELF handlers for self-subscription (events from current connection)
 * ```ts
 * { SELF: { "order.created": (ctx, env) => result } }
 * ```
 */
export type EventHandlers<
  Env = unknown,
  TSchema extends z.ZodTypeAny = never,
> = [TSchema] extends [never]
  ? // When no schema, only SELF is available
    BatchHandler<Env> | { SELF?: SelfHandlers<Env> }
  :
      | BatchHandler<Env> // Global handler with events
      | ({
          [K in keyof z.infer<TSchema> as z.infer<TSchema>[K] extends {
            __type: string;
            value: string;
          }
            ? K
            : never]?: BindingHandlers<Env, z.infer<TSchema>[K]>;
        } & {
          /** SELF: Subscribe to events from the current connection */
          SELF?: SelfHandlers<Env>;
        });

/**
 * Extract only the keys from T where the value is a Binding shape.
 * Filters out non-binding properties at the type level.
 */
export type BindingKeysOf<T> = {
  [K in keyof T]: T[K] extends { __type: string; value: string } ? K : never;
}[keyof T];

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if handlers is a global batch handler (has handler + events at top level)
 */
const isGlobalHandler = <TEnv>(
  handlers: EventHandlers<TEnv, z.ZodTypeAny>,
): handlers is BatchHandler<TEnv> => {
  return (
    typeof handlers === "object" &&
    handlers !== null &&
    "handler" in handlers &&
    "events" in handlers &&
    typeof handlers.handler === "function" &&
    Array.isArray(handlers.events)
  );
};

/**
 * Check if a binding handler is a batch handler (has handler + events) vs per-event handlers (object of functions)
 */
const isBatchHandler = <TEnv>(
  handler: BindingHandlers<TEnv>,
): handler is BatchHandler<TEnv> => {
  return (
    typeof handler === "object" &&
    handler !== null &&
    "handler" in handler &&
    "events" in handler &&
    typeof handler.handler === "function" &&
    Array.isArray(handler.events)
  );
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Event subscription separator - used in global handlers to specify binding
 * Format: BINDING::EVENT_TYPE (e.g., "SELF::order.created", "DATABASE::record.updated")
 */
const EVENT_SEPARATOR = "::" as const;

/**
 * Parse a prefixed event type into binding and event type
 * @param prefixedEvent - Event in format "BINDING::EVENT_TYPE"
 * @returns Tuple of [binding, eventType] or null if not prefixed
 */
const parseEventPrefix = (
  prefixedEvent: string,
): [binding: string, eventType: string] | null => {
  const separatorIndex = prefixedEvent.indexOf(EVENT_SEPARATOR);
  if (separatorIndex === -1) {
    return null;
  }
  const binding = prefixedEvent.substring(0, separatorIndex);
  const eventType = prefixedEvent.substring(
    separatorIndex + EVENT_SEPARATOR.length,
  );
  return [binding, eventType];
};

/**
 * Get binding keys from event handlers object
 */
const getBindingKeys = <TEnv, TSchema extends z.ZodTypeAny>(
  handlers: EventHandlers<TEnv, TSchema>,
): string[] => {
  if (isGlobalHandler<TEnv>(handlers)) {
    return [];
  }
  return Object.keys(handlers);
};

/**
 * Get event types for a binding from handlers
 */
const getEventTypesForBinding = <TEnv, TSchema extends z.ZodTypeAny>(
  handlers: EventHandlers<TEnv, TSchema>,
  binding: string,
): string[] => {
  if (isGlobalHandler<TEnv>(handlers)) {
    return handlers.events;
  }
  const bindingHandler = handlers[binding as keyof typeof handlers];
  if (!bindingHandler) {
    return [];
  }
  if (isBatchHandler(bindingHandler)) {
    // Batch handler - return explicit events array
    return bindingHandler.events;
  }
  // Per-event handlers - event types are the keys
  return Object.keys(bindingHandler);
};

/**
 * Resolve a binding name to its publisher (connection ID)
 * Handles SELF specially by using the current connectionId
 */
const resolvePublisher = (
  binding: string,
  state: Record<string, unknown>,
  connectionId?: string,
): string | null => {
  if (binding === SELF) {
    if (!connectionId) {
      console.warn("[Event] SELF binding used but no connectionId available");
      return null;
    }
    return connectionId;
  }

  const bindingValue = state[binding];
  if (!isBinding(bindingValue)) {
    console.warn(`[Event] Binding "${binding}" not found in state`);
    return null;
  }
  return bindingValue.value;
};

/**
 * Get subscriptions from event handlers and state
 * Returns flat array of { eventType, publisher } for EVENT_SYNC_SUBSCRIPTIONS
 *
 * For global handlers, events must be prefixed with binding name:
 * - "SELF::order.created" - subscribe to order.created from current connection
 * - "DATABASE::record.updated" - subscribe to record.updated from DATABASE binding
 *
 * @param handlers - Event handlers configuration
 * @param state - Resolved bindings state (can be unknown when only SELF is used)
 * @param connectionId - Current connection ID (used for SELF subscriptions)
 */
const eventsSubscriptions = <TEnv, TSchema extends z.ZodTypeAny = never>(
  handlers: EventHandlers<TEnv, TSchema>,
  state: z.infer<TSchema> | Record<string, unknown>,
  connectionId?: string,
): EventSubscription[] => {
  const stateRecord = state as Record<string, unknown>;

  if (isGlobalHandler<TEnv>(handlers)) {
    // Global handler - events must be prefixed with BINDING::EVENT_TYPE
    const subscriptions: EventSubscription[] = [];
    for (const prefixedEvent of handlers.events) {
      const parsed = parseEventPrefix(prefixedEvent);
      if (!parsed) {
        console.warn(
          `[Event] Global handler event "${prefixedEvent}" must be prefixed with BINDING:: (e.g., "SELF::${prefixedEvent}" or "DATABASE::${prefixedEvent}")`,
        );
        continue;
      }

      const [binding, eventType] = parsed;
      const publisher = resolvePublisher(binding, stateRecord, connectionId);
      if (!publisher) continue;

      subscriptions.push({
        eventType,
        publisher,
      });
    }
    return subscriptions;
  }

  const subscriptions: EventSubscription[] = [];
  for (const binding of getBindingKeys(handlers)) {
    const publisher = resolvePublisher(binding, stateRecord, connectionId);
    if (!publisher) continue;

    const eventTypes = getEventTypesForBinding(handlers, binding);
    for (const eventType of eventTypes) {
      subscriptions.push({
        eventType,
        publisher,
      });
    }
  }
  return subscriptions;
};

// ============================================================================
// Event Execution
// ============================================================================

/**
 * Group events by source (connection ID)
 */
const groupEventsBySource = (
  events: CloudEvent[],
): Map<string, CloudEvent[]> => {
  const grouped = new Map<string, CloudEvent[]>();
  for (const event of events) {
    const source = event.source;
    const existing = grouped.get(source) || [];
    existing.push(event);
    grouped.set(source, existing);
  }
  return grouped;
};

/**
 * Group events by type
 */
const groupEventsByType = (events: CloudEvent[]): Map<string, CloudEvent[]> => {
  const grouped = new Map<string, CloudEvent[]>();
  for (const event of events) {
    const type = event.type;
    const existing = grouped.get(type) || [];
    existing.push(event);
    grouped.set(type, existing);
  }
  return grouped;
};

/**
 * Merge multiple OnEventsOutput results into a single result
 */
const mergeResults = (results: OnEventsOutput[]): OnEventsOutput => {
  const merged: OnEventsOutput = {};
  const allResults: Record<string, EventResult> = {};

  let hasAnyFailure = false;
  let totalProcessed = 0;
  const errors: string[] = [];

  for (const result of results) {
    // Merge per-event results
    if (result.results) {
      Object.assign(allResults, result.results);
    }

    // Track batch-level status
    if (result.success === false) {
      hasAnyFailure = true;
      if (result.error) {
        errors.push(result.error);
      }
    }

    if (result.processedCount !== undefined) {
      totalProcessed += result.processedCount;
    }
  }

  // Build merged result
  if (Object.keys(allResults).length > 0) {
    merged.results = allResults;
  }

  // Set batch-level success based on all results
  merged.success = !hasAnyFailure;

  if (errors.length > 0) {
    merged.error = errors.join("; ");
  }

  if (totalProcessed > 0) {
    merged.processedCount = totalProcessed;
  }

  return merged;
};

/**
 * Execute event handlers and return merged result
 *
 * Supports four handler formats:
 * 1. Global: `{ handler: fn, events: ["SELF::order.created", "DB::record.updated"] }` - prefixed events
 * 2. Per-binding batch: `{ BINDING: { handler: fn, events: [...] } }` - handles all events from binding
 * 3. Per-event: `{ BINDING: { "event.type": handler } }` - handles specific events
 * 4. SELF: `{ SELF: { "event.type": handler } }` - handles events from current connection
 *
 * @param handlers - Event handlers configuration
 * @param events - CloudEvents to process
 * @param env - Environment
 * @param state - Resolved bindings state (can be unknown when only SELF is used)
 * @param connectionId - Current connection ID (used for SELF handlers)
 */
const executeEventHandlers = async <TEnv, TSchema extends z.ZodTypeAny>(
  handlers: EventHandlers<TEnv, TSchema>,
  events: CloudEvent[],
  env: TEnv,
  state: z.infer<TSchema> | Record<string, unknown>,
  connectionId?: string,
): Promise<OnEventsOutput> => {
  const stateRecord = state as Record<string, unknown>;

  // Case 1: Global handler with prefixed events
  if (isGlobalHandler<TEnv>(handlers)) {
    // Build a set of valid (publisher, eventType) pairs from prefixed events
    const validSubscriptions = new Set<string>();
    for (const prefixedEvent of handlers.events) {
      const parsed = parseEventPrefix(prefixedEvent);
      if (!parsed) continue;

      const [binding, eventType] = parsed;
      const publisher = resolvePublisher(binding, stateRecord, connectionId);
      if (!publisher) continue;

      // Create a key for quick lookup: "publisher:eventType"
      validSubscriptions.add(`${publisher}:${eventType}`);
    }

    // Filter events to only those that match our subscriptions
    const matchingEvents = events.filter((event) => {
      const key = `${event.source}:${event.type}`;
      return validSubscriptions.has(key);
    });

    if (matchingEvents.length === 0) {
      return { success: true };
    }

    try {
      return await handlers.handler({ events: matchingEvents }, env);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Build a map from connectionId -> binding key
  const connectionToBinding = new Map<string, string>();
  for (const binding of getBindingKeys(handlers)) {
    const publisher = resolvePublisher(binding, stateRecord, connectionId);
    if (publisher) {
      connectionToBinding.set(publisher, binding);
    }
  }

  // Group events by source
  const eventsBySource = groupEventsBySource(events);

  // Process each binding's events in parallel
  const promises: Promise<OnEventsOutput>[] = [];

  for (const [source, sourceEvents] of eventsBySource) {
    const binding = connectionToBinding.get(source);
    if (!binding) {
      // No handler for this source - mark as success (ignore)
      continue;
    }

    const bindingHandler = handlers[binding as keyof typeof handlers];
    if (!bindingHandler) continue;

    // Case 2: Per-binding batch handler
    if (isBatchHandler(bindingHandler)) {
      promises.push(
        (async () => {
          try {
            return await bindingHandler.handler({ events: sourceEvents }, env);
          } catch (error) {
            // Mark all events from this binding as failed
            const results: Record<string, EventResult> = {};
            for (const event of sourceEvents) {
              results[event.id] = {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              };
            }
            return { results };
          }
        })(),
      );
      continue;
    }

    // Case 3: Per-event handlers
    const perEventHandlers = bindingHandler as Record<
      string,
      PerEventHandler<TEnv>
    >;
    const eventsByType = groupEventsByType(sourceEvents);

    for (const [eventType, typedEvents] of eventsByType) {
      const eventHandler = perEventHandlers[eventType];
      if (!eventHandler) {
        // No handler for this event type - mark as success (ignore)
        continue;
      }

      // Case 3a: Cron handlers (event type starts with "cron/")
      // - Handler signature: (env) => Promise<void>
      // - Fire and forget (don't await)
      // - Always return success immediately
      if (eventType.startsWith("cron/")) {
        const cronHandler = eventHandler as unknown as (
          env: TEnv,
        ) => Promise<void>;

        // Fire and forget - don't await, just log errors
        cronHandler(env).catch((error) => {
          console.error(
            `[Event] Cron handler error for ${eventType}:`,
            error instanceof Error ? error.message : String(error),
          );
        });

        // Immediately return success for all cron events
        const results: Record<string, EventResult> = {};
        for (const event of typedEvents) {
          results[event.id] = { success: true };
        }
        promises.push(Promise.resolve({ results }));
        continue;
      }

      // Case 3b: Regular per-event handlers
      // Call handler for each event type (handler receives all events of that type)
      promises.push(
        (async () => {
          try {
            const result = await eventHandler({ events: typedEvents }, env);
            // Convert per-event result to output with results for each event
            const results: Record<string, EventResult> = {};
            for (const event of typedEvents) {
              results[event.id] = result;
            }
            return { results };
          } catch (error) {
            const results: Record<string, EventResult> = {};
            for (const event of typedEvents) {
              results[event.id] = {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              };
            }
            return { results };
          }
        })(),
      );
    }
  }

  // Wait for all handlers to complete
  const results = await Promise.all(promises);

  // If no handlers were called, return success
  if (results.length === 0) {
    return { success: true };
  }

  // Merge all results
  return mergeResults(results);
};

// ============================================================================
// Exports
// ============================================================================

/**
 * Event utilities for subscriptions and execution
 */
export const Event = {
  subscriptions: eventsSubscriptions,
  execute: executeEventHandlers,
};

import type {
  CloudEvent,
  EventResult,
  OnEventsOutput,
} from "@decocms/bindings";
import z from "zod";

// ============================================================================
// Types
// ============================================================================

export interface EventSubscription {
  connectionId: string;
  events: string[];
}

interface Binding {
  __type: string;
  value: string;
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
 * Batch handler with explicit event types for subscription
 */
export interface BatchHandler<TEnv> {
  /** Handler function */
  handler: BatchHandlerFn<TEnv>;
  /** Event types to subscribe to */
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
export type BindingHandlers<TEnv> =
  | BatchHandler<TEnv>
  | Record<string, PerEventHandler<TEnv>>;

/**
 * EventHandlers type supports three granularity levels:
 *
 * @example Global handler with explicit events
 * ```ts
 * { handler: (ctx, env) => result, events: ["order.created"] }
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
 */
export type EventHandlers<TSchema extends z.ZodTypeAny = never> = [
  TSchema,
] extends [never]
  ? Record<string, never>
  :
      | BatchHandler<z.infer<TSchema>> // Global handler with events
      | {
          [K in keyof z.infer<TSchema> as z.infer<TSchema>[K] extends {
            __type: string;
            value: string;
          }
            ? K
            : never]?: BindingHandlers<z.infer<TSchema>>;
        };

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

const isBinding = (v: unknown): v is Binding => {
  return (
    typeof v === "object" &&
    v !== null &&
    "__type" in v &&
    typeof v.__type === "string" &&
    "value" in v &&
    typeof v.value === "string"
  );
};

/**
 * Check if handlers is a global batch handler (has handler + events at top level)
 */
const isGlobalHandler = <TEnv>(
  handlers: EventHandlers<z.ZodTypeAny>,
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
 * Get binding keys from event handlers object
 */
const getBindingKeys = <TSchema extends z.ZodTypeAny>(
  handlers: EventHandlers<TSchema>,
): string[] => {
  if (isGlobalHandler(handlers)) {
    return [];
  }
  return Object.keys(handlers);
};

/**
 * Get event types for a binding from handlers
 */
const getEventTypesForBinding = <TSchema extends z.ZodTypeAny>(
  handlers: EventHandlers<TSchema>,
  binding: string,
): string[] => {
  if (isGlobalHandler(handlers)) {
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
 * Get scopes from event handlers for subscription
 */
const scopesFromEvents = <TSchema extends z.ZodTypeAny = never>(
  handlers: EventHandlers<TSchema>,
): string[] => {
  if (isGlobalHandler(handlers)) {
    // Global handler - scopes are based on explicit events array
    // Note: "*" binding means all bindings
    return handlers.events.map((event) => `*::event@${event}`);
  }

  const scopes: string[] = [];
  for (const binding of getBindingKeys(handlers)) {
    const eventTypes = getEventTypesForBinding(handlers, binding);
    for (const eventType of eventTypes) {
      scopes.push(`${binding}::event@${eventType}`);
    }
  }
  return scopes;
};

/**
 * Get subscriptions from event handlers and state
 */
const eventsSubscriptions = <TSchema extends z.ZodTypeAny = never>(
  handlers: EventHandlers<TSchema>,
  state: z.infer<TSchema>,
): EventSubscription[] => {
  if (isGlobalHandler(handlers)) {
    // Global handler - subscribe to all bindings with the explicit events
    const subscriptions: EventSubscription[] = [];
    for (const [, value] of Object.entries(state)) {
      if (isBinding(value)) {
        subscriptions.push({
          connectionId: value.value,
          events: handlers.events,
        });
      }
    }
    return subscriptions;
  }

  const subscriptions: EventSubscription[] = [];
  for (const binding of getBindingKeys(handlers)) {
    const bindingValue = state[binding as keyof typeof state];
    if (!isBinding(bindingValue)) continue;

    const eventTypes = getEventTypesForBinding(handlers, binding);
    subscriptions.push({
      connectionId: bindingValue.value,
      events: eventTypes,
    });
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
 * Supports three handler formats:
 * 1. Global: `(context, env) => result` - handles all events
 * 2. Per-binding: `{ BINDING: (context, env) => result }` - handles all events from binding
 * 3. Per-event: `{ BINDING: { "event.type": (context, env) => result } }` - handles specific events
 */
const executeEventHandlers = async <TSchema extends z.ZodTypeAny>(
  handlers: EventHandlers<TSchema>,
  events: CloudEvent[],
  env: z.infer<TSchema>,
  state: z.infer<TSchema>,
): Promise<OnEventsOutput> => {
  // Case 1: Global handler
  if (isGlobalHandler(handlers)) {
    try {
      return await handlers.handler({ events }, env);
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
    const bindingValue = state[binding as keyof typeof state];
    if (isBinding(bindingValue)) {
      connectionToBinding.set(bindingValue.value, binding);
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
      PerEventHandler<z.infer<TSchema>>
    >;
    const eventsByType = groupEventsByType(sourceEvents);

    for (const [eventType, typedEvents] of eventsByType) {
      const eventHandler = perEventHandlers[eventType];
      if (!eventHandler) {
        // No handler for this event type - mark as success (ignore)
        continue;
      }

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
  scopes: scopesFromEvents,
  execute: executeEventHandlers,
};

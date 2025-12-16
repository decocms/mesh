import z from "zod";
import { EventHandlers } from "./tools";
import { MCPAppBinding } from "./wrangler";

export interface EventSubscription {
  connectionId: string;
  events: string[];
}

interface Binding {
  __type: string;
  value: string;
}

const isBinding = (v: unknown | Binding): v is Binding => {
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
 * Extract only the keys from T where the value is a Binding shape.
 * Filters out non-binding properties at the type level.
 */
export type BindingKeysOf<T> = {
  [K in keyof T]: T[K] extends { __type: string; value: string } ? K : never;
}[keyof T];

/**
 * Get the bindings from the events
 * @param events - The events to get the bindings from
 * @returns The bindings from the events (only keys that are MCP bindings)
 */
const bindingsOf = <TSchema extends z.ZodTypeAny = never>(
  events: EventHandlers<TSchema>,
): Array<BindingKeysOf<z.infer<TSchema>>> => {
  return Object.entries(events)
    .map(([key, value]) => {
      if (!isBinding(value)) {
        return;
      }
      return key as BindingKeysOf<z.infer<TSchema>>;
    })
    .filter((binding) => binding !== undefined);
};

/**
 * Get the scopes from the subscriptions
 * @param subscriptions - The subscriptions to get the scopes from
 * @returns The scopes from the subscriptions
 */
const scopesFromEvents = <TSchema extends z.ZodTypeAny = never>(
  events: EventHandlers<TSchema>,
): string[] => {
  return bindingsOf(events).flatMap((binding) => {
    return Object.keys(events[binding] ?? {}).flatMap((event) => {
      return `${String(binding)}::event@${event}`;
    });
  });
};

/**
 * Get the subscriptions to the events
 * @param events - The events to subscribe to
 * @param state - The state of the application
 * @returns The subscriptions to the events
 */
const eventsSubscriptions = <TSchema extends z.ZodTypeAny = never>(
  events: EventHandlers<TSchema>,
  state: z.infer<TSchema>,
): EventSubscription[] => {
  const subscriptions = bindingsOf<TSchema>(events).map((binding) => {
    const bindingEvents = Object.keys(events[binding] ?? {});
    const bindingValue = state[binding].value;
    return {
      connectionId: bindingValue.value as string,
      events: bindingEvents,
    } satisfies EventSubscription;
  });
  return subscriptions.filter((subscription) => subscription !== undefined);
};

/**
 * Event utilities
 * @param events - The events to get the subscriptions from
 * @returns The subscriptions to the events
 */
export const Event = {
  subscriptions: eventsSubscriptions,
  scopes: scopesFromEvents,
};

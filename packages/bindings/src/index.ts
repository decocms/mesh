/**
 * @decocms/bindings
 *
 * Core type definitions for the bindings system.
 * Bindings define standardized interfaces that integrations (MCPs) can implement.
 */

// Re-export core binder types and utilities
export {
  createBindingChecker,
  bindingClient,
  connectionImplementsBinding,
  type Binder,
  type BindingChecker,
  type ToolBinder,
  type ToolWithSchemas,
  type ConnectionForBinding,
} from "./core/binder";

// Re-export plugin context types and provider
export {
  type PluginContext,
  type PluginContextPartial,
  type PluginConnectionEntity,
  type PluginOrgContext,
  type PluginSession,
  type TypedToolCaller,
} from "./core/plugin-context";

export {
  PluginContextProvider,
  usePluginContext,
  type PluginContextProviderProps,
  type UsePluginContextOptions,
} from "./core/plugin-context-provider";

// Re-export registry binding types
export {
  MCPRegistryServerSchema,
  type RegistryAppCollectionEntity,
  REGISTRY_APP_BINDING,
} from "./well-known/registry";

// Re-export event subscriber binding types (for connections that receive events)
export {
  CloudEventSchema,
  type CloudEvent,
  EventResultSchema,
  type EventResult,
  OnEventsInputSchema,
  type OnEventsInput,
  OnEventsOutputSchema,
  type OnEventsOutput,
  EVENT_SUBSCRIBER_BINDING,
  EventSubscriberBinding,
  type EventSubscriberBindingClient,
} from "./well-known/event-subscriber";

// Re-export event bus binding types (for interacting with an event bus)
export {
  EventPublishInputSchema,
  type EventPublishInput,
  EventPublishOutputSchema,
  type EventPublishOutput,
  EventSubscribeInputSchema,
  type EventSubscribeInput,
  EventSubscribeOutputSchema,
  type EventSubscribeOutput,
  EventUnsubscribeInputSchema,
  type EventUnsubscribeInput,
  EventUnsubscribeOutputSchema,
  type EventUnsubscribeOutput,
  EventCancelInputSchema,
  type EventCancelInput,
  EventCancelOutputSchema,
  type EventCancelOutput,
  EventAckInputSchema,
  type EventAckInput,
  EventAckOutputSchema,
  type EventAckOutput,
  SubscriptionItemSchema,
  type SubscriptionItem,
  SubscriptionDetailSchema,
  type SubscriptionDetail,
  EventSyncSubscriptionsInputSchema,
  type EventSyncSubscriptionsInput,
  EventSyncSubscriptionsOutputSchema,
  type EventSyncSubscriptionsOutput,
  EVENT_BUS_BINDING,
  EventBusBinding,
  type EventBusBindingClient,
} from "./well-known/event-bus";

# Workflow Plugin - Event Bus Integration

## How the Mesh Event Bus Works

### Architecture

The event bus is a durable pub/sub system with at-least-once delivery:

1. **Publish**: Events are written to the database (`event` table) via `eventBus.publish(orgId, connectionId, { type, subject, data })`
2. **Subscriptions**: Connections subscribe to event types. Subscriptions are stored in `event_subscription` table with `{ connectionId, eventType, publisher }`
3. **Deliveries**: When an event is published, the system creates `event_delivery` rows for each matching subscription
4. **Worker**: `EventBusWorker` polls for pending deliveries, groups them by connection, and calls `ON_EVENTS` on the subscriber connection via MCP proxy
5. **ON_EVENTS**: The subscriber connection must implement the `EVENT_SUBSCRIBER_BINDING` which exposes an `ON_EVENTS` tool that receives batches of CloudEvents

### Key Files

- `apps/mesh/src/event-bus/event-bus.ts` - EventBus implementation (publish, subscribe)
- `apps/mesh/src/event-bus/worker.ts` - Background worker that processes pending deliveries
- `apps/mesh/src/event-bus/notify.ts` - `createNotifySubscriber()` - calls `ON_EVENTS` on connections via MCP proxy
- `apps/mesh/src/storage/event-bus.ts` - DB operations for events, subscriptions, deliveries
- `packages/bindings/src/well-known/event-subscriber.ts` - `EVENT_SUBSCRIBER_BINDING` (defines `ON_EVENTS` tool)

### How MCP Studio Did It (via @decocms/runtime)

MCP Studio used `withRuntime()` from `@decocms/runtime` which automatically:

1. Registered `SELF` event handlers in `main.ts`:
   ```ts
   const runtime = withRuntime({
     events: {
       handlers: {
         SELF: {
           events: [...WORKFLOW_EVENTS],
           handler: async ({ events }, env) => {
             handleWorkflowEvents(events, env);
             return { success: true };
           },
         },
       },
     },
   });
   ```

2. The runtime's `ON_CONFIGURE` tool calls `EVENT_SYNC_SUBSCRIPTIONS` which creates subscriptions for the connection to its own events (SELF = publisher is the same connection)

3. The runtime automatically exposes an `ON_EVENTS` tool that routes incoming events to the registered handlers

4. So the flow was: connection publishes `workflow.execution.created` → event bus creates delivery for the same connection → worker calls `ON_EVENTS` on that connection → runtime routes to the workflow handler

### The Problem for Mesh Plugins

Server plugins (`ServerPlugin` interface) are **not connections**. They:
- Don't have a connection ID
- Don't go through the MCP proxy
- Don't expose `ON_EVENTS`
- Can't use `EVENT_SYNC_SUBSCRIPTIONS`

The workflow tools run in the context of the SELF MCP (`/mcp/self`), which is the management MCP. When the tool publishes `workflow.execution.created`, there's no subscription matching that event type, so no delivery is created and nothing happens.

## What Needs to Be Decided

### Option A: Add `onEvents` to ServerPlugin Interface

Extend the `ServerPlugin` interface in `packages/bindings/src/core/server-plugin.ts` to support event handlers:

```ts
export interface ServerPlugin {
  // ... existing fields ...

  /**
   * Event types this plugin handles.
   * The system will create internal subscriptions for these.
   */
  events?: {
    types: string[];
    handler: (events: CloudEvent[], ctx: ServerPluginContext) => Promise<void>;
  };
}
```

Then in `apps/mesh/src/api/app.ts` (or wherever plugins are initialized), the system would:
1. Create subscriptions for the SELF connection to these event types
2. Route incoming `ON_EVENTS` calls to the plugin handler when event types match

**Pros**: Clean plugin API, durable via event bus, plugins don't need to know about connections
**Cons**: Requires changes to the core plugin system and SELF MCP event routing

### Option B: Subscribe the SELF Connection

The SELF MCP already exists as a connection. The workflow plugin could:
1. On startup, call `eventBus.subscribe(orgId, { connectionId: selfConnectionId, eventType: "workflow.*" })`
2. The SELF MCP would need to implement `ON_EVENTS` and route workflow events to the orchestrator

**Pros**: Uses existing event bus infrastructure as-is
**Cons**: SELF MCP doesn't currently implement `ON_EVENTS`, subscription needs to happen per-organization

### Option C: Plugin Registers as a Virtual Internal Connection

Create a dedicated internal connection for the workflow plugin that:
1. Has its own connection ID (e.g., `plugin_workflows`)
2. Implements `ON_EVENTS` via the plugin's event handler
3. Auto-subscribes to workflow event types

**Pros**: Full isolation, standard event bus flow
**Cons**: More infrastructure, fake connection concept

### Option D: Direct Orchestrator Calls (No Event Bus)

Skip the event bus entirely. Call the orchestrator directly from the tools, using `Promise` fire-and-forget for background execution.

**Pros**: Simplest, no infrastructure changes
**Cons**: Not durable - if the server crashes mid-execution, the workflow is lost. No retry. Defeats the purpose of having an event bus.

## Current State

- Workflow tools publish events (`workflow.execution.created`, `workflow.step.execute`, `workflow.step.completed`)
- Event handler exists at `server/events/handler.ts` ready to process these events
- Orchestrator exists at `server/engine/orchestrator.ts` ready to execute workflows
- **Missing**: The bridge between the event bus and the orchestrator (subscriptions + ON_EVENTS routing)

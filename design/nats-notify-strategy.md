# NatsNotifyStrategy — Implementation Plan

## What and Why

The `NotifyStrategy` interface (`apps/mesh/src/event-bus/notify-strategy.ts`) is the abstraction for waking up the event bus worker when new events are published. Today `PostgresNotifyStrategy` handles this via `pg_notify` / `LISTEN`.

The case for replacing it with NATS:

- NATS is purpose-built for pubsub. LISTEN/NOTIFY is a bolted-on Postgres feature.
- `PostgresNotifyStrategy` holds a dedicated `PoolClient` open permanently for LISTEN. Reconnection on error is manual (`cleanup()` + fall back to next poll cycle). The `nats.js` client handles reconnection transparently.
- Separates messaging concerns from the database — NATS for signals, Postgres for data.
- The `notify-strategy.ts` comment at line 8 already anticipates this: `// NATS: Subscribe (future)`.

## The Interface (No Changes Needed)

```typescript
// notify-strategy.ts — already exists, nothing to change
export interface NotifyStrategy {
  start(onNotify: () => void): Promise<void>;
  stop(): Promise<void>;
  notify(eventId: string): Promise<void>;
}
```

`NatsNotifyStrategy` just implements these three methods.

## Implementation

### Dependency

```bash
bun add nats
```

### File: `apps/mesh/src/event-bus/nats-notify.ts`

```typescript
import { connect, type NatsConnection, type Subscription } from "nats";
import type { NotifyStrategy } from "./notify-strategy";

const SUBJECT = "mesh.events.notify";

export interface NatsNotifyStrategyOptions {
  /** NATS server URL(s), e.g. "nats://localhost:4222" */
  servers: string | string[];
}

export class NatsNotifyStrategy implements NotifyStrategy {
  private nc: NatsConnection | null = null;
  private sub: Subscription | null = null;
  private onNotify: (() => void) | null = null;
  private readonly options: NatsNotifyStrategyOptions;

  constructor(options: NatsNotifyStrategyOptions) {
    this.options = options;
  }

  async start(onNotify: () => void): Promise<void> {
    if (this.nc) return; // Already started

    this.onNotify = onNotify;

    this.nc = await connect({ servers: this.options.servers });

    // Subscribe to the notify subject
    this.sub = this.nc.subscribe(SUBJECT);

    // Process messages in background — each message wakes the worker
    (async () => {
      for await (const _msg of this.sub!) {
        if (this.onNotify) {
          this.onNotify();
        }
      }
    })().catch((err) => {
      console.error("[NatsNotify] Subscription error:", err);
    });

    console.log("[NatsNotify] Started, subscribed to", SUBJECT);
  }

  async stop(): Promise<void> {
    this.sub?.unsubscribe();
    this.sub = null;
    this.onNotify = null;

    if (this.nc) {
      await this.nc.drain();
      this.nc = null;
    }

    console.log("[NatsNotify] Stopped");
  }

  async notify(eventId: string): Promise<void> {
    if (!this.nc) return;

    try {
      // Publish event ID as payload — all subscribers wake up simultaneously
      this.nc.publish(SUBJECT, new TextEncoder().encode(eventId));
    } catch (err) {
      // Non-critical — polling will still pick it up
      console.warn("[NatsNotify] Publish failed (non-critical):", err);
    }
  }
}
```

### Wiring It Up

Replace `PostgresNotifyStrategy` in `apps/mesh/src/api/app.ts`:

```typescript
import { NatsNotifyStrategy } from "../event-bus/nats-notify";
import { PollingStrategy } from "../event-bus/polling";
import { compose } from "../event-bus/notify-strategy";

const strategy = compose(
  new PollingStrategy(30_000),  // Safety net every 30s
  new NatsNotifyStrategy({ servers: process.env.NATS_URL ?? "nats://localhost:4222" }),
);

const eventBus = new EventBus({
  storage: eventBusStorage,
  notifyStrategy: strategy,
});
```

The `compose()` helper already exists and fans out both `notify()` and `start()` to all strategies. The polling safety net means a NATS blip doesn't stall delivery — just adds up to 30s latency.

## Multi-Instance Behavior

`pg_notify` broadcasts to all clients connected to that Postgres server — all app instances wake up. NATS publish to a subject fans out to all subscribers the same way. Behavior is identical.

If you want to namespace by deployment later (e.g. separate NATS accounts per tenant), change the subject to `mesh.{deploymentId}.events.notify`. One-line change.

## Configuration

`NATS_URL` env var (e.g. `nats://localhost:4222` or `nats://user:pass@nats:4222`).

## Compared to PostgresNotifyStrategy

| Concern | PostgresNotifyStrategy | NatsNotifyStrategy |
|---|---|---|
| Extra infra required | No (reuses DB pool) | Yes (NATS server) |
| Dedicated connection | Yes (pool client held open) | No (shared connection) |
| Reconnection handling | Manual (cleanup + fall back to poll) | Handled by nats.js |
| Multi-instance fan-out | Yes | Yes |
| Separation of concerns | No (messaging via DB) | Yes |

## Effort

- ~60 lines of new code in `nats-notify.ts`
- Zero changes to `NotifyStrategy` interface
- Zero changes to `EventBus` or `EventBusWorker`
- One wiring change in `app.ts`
- `bun add nats`

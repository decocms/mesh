# NATS JetStream Event Bus — Exploration

## The Question

Could the entire event bus be replaced with NATS JetStream instead of keeping events + deliveries in the database? And would that be a good idea if/when the DB event bus becomes a scaling bottleneck?

Short answer: **a full replacement is not a good idea, but a hybrid architecture that offloads the delivery pipeline to JetStream is viable and worth planning for**.

---

## What We Have Today

The DB-backed event bus has these distinct responsibilities (all of which matter for evaluating a migration):

1. **Event persistence** — events stored with type, source, data, cron expression, status
2. **Subscription registry** — which connections want which event types, with optional JSONPath filters
3. **Delivery tracking** — per `(event, subscription)` delivery records with status, attempt count, retry timing
4. **Worker notification** — waking up the worker when events arrive (`NotifyStrategy`)
5. **Cron scheduling** — calculating next delivery time after each cron event fires
6. **Scheduled delivery** — `deliverAt` for future one-shot events
7. **Queryable history** — `getEvent`, `listSubscriptions`, audit trail
8. **Stuck delivery recovery** — `resetStuckDeliveries` on startup after crash

JetStream natively handles some of these. Others it cannot.

---

## What JetStream Handles Well

### Multi-worker delivery (replaces `FOR UPDATE SKIP LOCKED`)

Today `claimPendingDeliveries` does an atomic `UPDATE ... WHERE status='pending' RETURNING ...` to prevent two workers from picking up the same delivery.

JetStream **queue consumers** (also called consumer groups) handle this natively — a message is delivered to exactly one subscriber in a group, with ack required. This is its core purpose and it's bulletproof.

### Ack / Nack / Retry

Today the worker writes delivery state back to the DB after every batch:
- `markDeliveriesDelivered()`
- `markDeliveriesFailed()` with exponential backoff calculation
- `scheduleRetryWithoutAttemptIncrement()`

JetStream ack/nack handles this without DB writes:
- Ack → message consumed, done
- Nack with delay → redelivery after N ms
- Max delivery count → moves to dead-letter stream

Retry and backoff config lives in the JetStream consumer, not application code.

### Stuck delivery recovery

`resetStuckDeliveries` resets messages stuck in `processing` state after a crash. JetStream handles this automatically — unacknowledged messages are redelivered after the `ack_wait` timeout expires. No startup recovery code needed.

### Throughput

DB write per delivery (claim, mark delivered, mark failed) is the bottleneck at scale. JetStream removes most of these writes for the happy path (published → ack).

---

## What JetStream Cannot Replace

### Cron scheduling

The cron feature (`EVENT_PUBLISH` with `cron: "0 * * * *"`) works by:
1. Storing the cron expression on the event row
2. After each delivery batch, computing `nextRun` via `croner` and writing a new `delivery` row

JetStream has no concept of recurring events tied to a cron expression. You'd need either:
- A separate cron scheduler process that publishes to the stream on schedule (external dependency, new failure mode)
- Keeping cron events in the DB and only routing immediate/scheduled one-shot events through JetStream

This alone is enough reason to keep the DB as the source of truth for event metadata.

### `deliverAt` — scheduled future delivery

The current model stores a `deliver_at` timestamp on delivery rows. The worker skips rows where `deliver_at > now()`. This is trivially correct and requires no external coordination.

JetStream has a `Nats-Expected-Last-Msg-Id` header and `Nats-MsgTTL` but no "don't deliver before this time" semantics on publish. You can implement delayed delivery by holding messages in application code or using a periodic sweeper, but that's exactly what we already have in the DB.

### JSONPath subscription filters

`EventSubscription` has a `filter` field — a JSONPath expression evaluated against the event payload. JetStream has subject-based filtering (e.g. `mesh.events.order.*`) but not payload-based filtering. The current filter matching happens in `getMatchingSubscriptions`, which is a SQL query. There's no JetStream equivalent.

You could move filtering to the delivery side (receive-and-discard), but then all subscribers receive all events regardless of filter, which defeats the purpose.

### Queryable event history

`getEvent()` and the SSE hub both need to query events by ID, org, and status. JetStream stores messages in streams but you can't query by arbitrary fields — you'd need a message ID lookup or a separate index.

The audit trail (`EVENT_SUBSCRIPTION_LIST`, monitoring of delivery failures) would require maintaining a parallel DB record for every event anyway, which means you haven't eliminated the DB writes — you've duplicated them.

### Organization-scoped subscriptions

Today subscriptions are org-scoped with optional publisher and JSONPath filters. Mapping this cleanly onto JetStream subjects requires a subject hierarchy like:

```
mesh.events.{orgId}.{eventType}
```

This works for org scoping and event type routing. But the `publisher` filter (only receive events from connection X) and `filter` (JSONPath on payload) have no subject-level equivalent, so they'd need application-level filtering after delivery.

### Per-event `retryAfter` flow

The `retryAfter` ack flow allows a subscriber to say "I got this event, I'm not done, retry in 60s without counting it as a failure". This is implemented by `scheduleRetryWithoutAttemptIncrement` — a specialized DB update.

JetStream's nack with delay is close but doesn't distinguish between "I failed" (increment attempt count) and "I need more time" (don't increment). You'd need custom metadata on the message or a separate tracking structure.

---

## Why a Full Replacement is Not Worth It (Right Now)

A full JetStream replacement means:
- Losing cron events or building a new cron scheduler
- Losing `deliverAt` or building an application-level delay buffer
- Losing JSONPath filters or accepting all-events-to-all-subscribers
- Losing queryable history or duplicating every event to the DB anyway
- Replacing the clean `EventBusStorage` interface with NATS-specific code

You'd add NATS as a hard infrastructure dependency, lose features, and gain throughput — but only for cases where the delivery pipeline is the bottleneck, which is not the typical bottleneck profile of an MCP control plane.

---

## The Hybrid Architecture (Worth Planning For)

The right escape hatch — if the DB delivery pipeline becomes a bottleneck — is a hybrid that preserves all current semantics while offloading the high-volume delivery path:

```
                    ┌──────────────┐
                    │   Database   │
                    │              │
  publish ──────────▶ events       │  (metadata, cron, history, subscriptions)
                    │ subscriptions│
                    └──────┬───────┘
                           │ fan-out on publish
                           ▼
                    ┌──────────────┐
                    │  JetStream   │
                    │              │  (delivery pipeline only)
                    │  stream per  │
                    │    org       │
                    └──────┬───────┘
                           │ queue consumer
                           ▼
                    ┌──────────────┐
                    │   Workers    │  (N instances, no FOR UPDATE SKIP LOCKED)
                    └──────────────┘
```

### How it works

1. `publish()` writes the event to the DB (for history, cron, deliverAt logic) — same as today
2. For immediate deliveries, instead of writing `event_delivery` rows, publish a message to JetStream per matching subscription: subject `mesh.events.{orgId}`, payload `{ eventId, subscriptionId }`
3. Workers consume from the queue consumer — JetStream handles exclusive delivery and retry
4. On ack: just ack the JetStream message, no DB write needed
5. On nack: JetStream redelivers, no DB write needed
6. Max attempts exceeded: message goes to a dead-letter stream, worker writes failure to DB

**Cron and `deliverAt`** still go through the DB delivery table and the polling worker — these are low-volume and the DB handles them fine.

**Subscriptions and filters** still live in the DB — this is read-heavy and cacheable.

### What this buys

- Removes `claimPendingDeliveries` (the `FOR UPDATE SKIP LOCKED` / SQLite atomic hack)
- Removes DB writes on the happy delivery path
- Multi-worker scaling without DB contention
- Automatic stuck-delivery recovery without startup logic

### What stays the same

- `EventBusStorage` interface — just the `createDeliveries` / `claimPendingDeliveries` / `markDeliveries*` methods change internally
- All features: cron, deliverAt, JSONPath filters, queryable history, retryAfter
- The `IEventBus` interface — callers see nothing change

### Implementation path

When/if needed, the migration would be:

1. Implement `JetStreamEventBusStorage` that satisfies `EventBusStorage` but routes immediate deliveries through JetStream
2. Keep `SqlEventBusStorage` for cron/scheduled delivery (or route all through JetStream with a DB metadata layer)
3. Gate behind `EVENT_BUS_BACKEND=jetstream` env var — both implementations coexist
4. The `EventBus` class takes an `EventBusStorage` — swap is one line at startup

The existing interface separation (`EventBusStorage`, `IEventBus`, `NotifyStrategy`) means this migration is almost entirely contained to a new file.

---

## Summary

| Capability | Full JetStream | Hybrid | DB-only (current) |
|---|---|---|---|
| Cron events | ❌ needs external scheduler | ✅ DB handles cron | ✅ |
| `deliverAt` scheduling | ❌ no native semantics | ✅ DB handles scheduled | ✅ |
| JSONPath filters | ❌ no payload filtering | ✅ DB handles matching | ✅ |
| Queryable event history | ❌ stream not queryable | ✅ DB has events | ✅ |
| Multi-worker scale | ✅ queue groups | ✅ queue groups | ⚠️ FOR UPDATE SKIP LOCKED |
| Happy path write cost | ✅ ack only | ✅ ack only | ❌ DB write per delivery |
| Stuck delivery recovery | ✅ automatic | ✅ automatic | ❌ manual on startup |
| Extra infra required | NATS | NATS | None |
| Feature parity | ❌ | ✅ | ✅ |

**Recommendation**: when scaling becomes a concern, implement the hybrid. The `EventBusStorage` interface already creates the exact seam needed. Until then, `NatsNotifyStrategy` (see `nats-notify-strategy.md`) is a zero-risk first step — better pubsub primitive, cleaner connection management, no feature changes.

# Section 2: Message Passing (NATS) - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adapt the message passing layer for PGlite compatibility while preserving all existing NATS functionality unchanged.

**Architecture:** The design doc declares "No changes" to NATS itself. The work here is making the existing notify strategy selection handle the new `PGliteDatabase` type correctly. PGlite (PostgreSQL-in-WASM) does NOT support `LISTEN/NOTIFY`, so local deployments must use `PollingStrategy` (same as current SQLite behavior). All four NATS strategies (NatsNotifyStrategy, NatsSSEBroadcast, NatsCancelBroadcast, NatsStreamBuffer) remain untouched.

**Tech Stack:** TypeScript, Bun test runner, Kysely

---

## Context

### Current State

The `MeshDatabase` discriminated union has two types:
- `SqliteDatabase { type: "sqlite", db }`
- `PostgresDatabase { type: "postgres", db, pool }`

The event bus factory (`apps/mesh/src/event-bus/index.ts`) selects notify strategy via `resolveNotifyStrategy()`:
- `NATS_URL` set -> NATS + polling
- `database.type === "postgres"` -> PostgreSQL LISTEN/NOTIFY + polling
- default -> polling only

### Target State (from design doc)

| Environment | Notify Strategy |
|---|---|
| Local (PGlite) | Polling |
| Cloud without NATS | PostgreSQL LISTEN/NOTIFY |
| Cloud with NATS | NATS (preferred) + polling fallback |

When PGlite replaces SQLite, `database.type` will be `"pglite"` (not `"postgres"`), so `resolveNotifyStrategy()` correctly falls through to polling. The key work is:

1. Add `PGliteDatabase` to the `MeshDatabase` union (foundation for Section 1)
2. Update event bus factory to explicitly handle the new type
3. Clean up SQLite references in event bus comments/docs
4. Add comprehensive tests for strategy selection

### What Does NOT Change

- `NatsNotifyStrategy` - zero changes
- `NatsSSEBroadcast` - zero changes
- `NatsCancelBroadcast` - zero changes
- `NatsStreamBuffer` - zero changes
- `NotifyStrategy` interface - zero changes
- `SSEBroadcastStrategy` interface - zero changes
- `PollingStrategy` - zero changes
- `PostgresNotifyStrategy` - zero changes
- `compose()` function - zero changes
- NATS subjects (`mesh.events.notify`, `mesh.sse.broadcast`, `mesh.decopilot.cancel`, `decopilot.stream.*`) - zero changes
- `createApp()` NATS initialization flow - zero changes

---

## Plan Files

| File | Task | Estimated Steps |
|---|---|---|
| [01-pglite-database-type.md](./01-pglite-database-type.md) | Add `PGliteDatabase` to `MeshDatabase` discriminated union | 9 steps |
| [02-strategy-selection.md](./02-strategy-selection.md) | Update event bus factory for PGlite + add tests | 11 steps |

**Total estimated steps:** 20

---

## Execution Order

Tasks must be executed sequentially: Task 1 before Task 2 (Task 2 depends on the PGlite type from Task 1).

## Verification

After both tasks are complete, run:
```bash
bun test apps/mesh/src/database/
bun test apps/mesh/src/event-bus/
bun run check
bun run lint
```

All must pass.

# Task 2: Update Event Bus Strategy Selection for PGlite

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the event bus factory to explicitly handle PGlite in strategy selection and add comprehensive tests for all strategy paths.

**Architecture:** The `resolveNotifyStrategy()` function currently checks `database.type === "postgres"` to select PostgreSQL LISTEN/NOTIFY. With PGlite added as `type: "pglite"`, this correctly falls through to polling (PGlite doesn't support LISTEN/NOTIFY). We make this explicit rather than relying on fallthrough, update comments, and add tests.

**Tech Stack:** TypeScript, Bun test runner

---

## Files

- Modify: `apps/mesh/src/event-bus/index.ts`
- Modify: `apps/mesh/src/event-bus/polling.ts` (comment only)
- Create: `apps/mesh/src/event-bus/strategy-selection.test.ts`

---

## Step 1: Write the failing test for strategy selection

Create `apps/mesh/src/event-bus/strategy-selection.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import type { MeshDatabase } from "../database";
import type { Kysely } from "kysely";

// We need to test resolveNotifyStrategy, but it's not exported.
// Instead, test the observable behavior via createEventBus log output.
// We'll capture console.log calls to verify which strategy was selected.

const fakeDb = {} as Kysely<any>;

function makeSqliteDb(): MeshDatabase {
  return { type: "sqlite", db: fakeDb };
}

function makePostgresDb(): MeshDatabase {
  return { type: "postgres", db: fakeDb, pool: {} as any };
}

function makePGliteDb(): MeshDatabase {
  return { type: "pglite", db: fakeDb };
}

describe("resolveNotifyStrategy", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clean env for each test
    delete process.env.NOTIFY_STRATEGY;
    delete process.env.NATS_URL;
  });

  afterEach(() => {
    process.env.NOTIFY_STRATEGY = originalEnv.NOTIFY_STRATEGY;
    process.env.NATS_URL = originalEnv.NATS_URL;
  });

  test("auto-detect: PGlite -> polling (not postgres LISTEN/NOTIFY)", () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    try {
      // Dynamic import to pick up env changes
      // We test by calling createEventBus and checking which strategy message is logged
      const { createEventBus } = require("./index");
      const eventBus = createEventBus(makePGliteDb());
      expect(logs.some((l) => l.includes("Using polling notify strategy"))).toBe(true);
      expect(logs.some((l) => l.includes("LISTEN/NOTIFY"))).toBe(false);
      eventBus.stop?.();
    } finally {
      console.log = origLog;
    }
  });

  test("auto-detect: sqlite -> polling", () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    try {
      const { createEventBus } = require("./index");
      const eventBus = createEventBus(makeSqliteDb());
      expect(logs.some((l) => l.includes("Using polling notify strategy"))).toBe(true);
      eventBus.stop?.();
    } finally {
      console.log = origLog;
    }
  });

  test("auto-detect: postgres without NATS_URL -> postgres LISTEN/NOTIFY", () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    try {
      const { createEventBus } = require("./index");
      const eventBus = createEventBus(makePostgresDb());
      expect(logs.some((l) => l.includes("LISTEN/NOTIFY"))).toBe(true);
      eventBus.stop?.();
    } finally {
      console.log = origLog;
    }
  });

  test("explicit NOTIFY_STRATEGY=polling overrides postgres", () => {
    process.env.NOTIFY_STRATEGY = "polling";
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    try {
      const { createEventBus } = require("./index");
      const eventBus = createEventBus(makePostgresDb());
      expect(logs.some((l) => l.includes("Using polling notify strategy"))).toBe(true);
      eventBus.stop?.();
    } finally {
      console.log = origLog;
    }
  });

  test("explicit NOTIFY_STRATEGY=postgres with PGlite falls back to polling", () => {
    process.env.NOTIFY_STRATEGY = "postgres";
    const logs: string[] = [];
    const origLog = console.log;
    const origWarn = console.warn;
    console.log = (...args: any[]) => logs.push(args.join(" "));
    console.warn = (...args: any[]) => logs.push(args.join(" "));

    try {
      const { createEventBus } = require("./index");
      const eventBus = createEventBus(makePGliteDb());
      // Should warn and fall back to polling because PGlite has no pool
      expect(logs.some((l) => l.includes("falling back to polling"))).toBe(true);
      eventBus.stop?.();
    } finally {
      console.log = origLog;
      console.warn = origWarn;
    }
  });

  test("explicit NOTIFY_STRATEGY=nats without NATS_URL throws", () => {
    process.env.NOTIFY_STRATEGY = "nats";
    delete process.env.NATS_URL;

    const { createEventBus } = require("./index");
    expect(() => createEventBus(makePGliteDb())).toThrow(
      "NOTIFY_STRATEGY=nats requires NATS_URL",
    );
  });
});
```

## Step 2: Run test to verify it fails

Run: `bun test apps/mesh/src/event-bus/strategy-selection.test.ts`

Expected: Some tests may fail because the `"postgres"` case guard in `createEventBus` currently checks `database.type !== "postgres"` but PGlite would pass `"pglite"` which is already not `"postgres"`. The explicit `NOTIFY_STRATEGY=postgres` with PGlite test should demonstrate the correct fallback behavior.

## Step 3: Update resolveNotifyStrategy for explicit PGlite handling

Modify `apps/mesh/src/event-bus/index.ts`:

**Update the `resolveNotifyStrategy` function (lines 87-103):**

```typescript
function resolveNotifyStrategy(database: MeshDatabase): NotifyStrategyName {
  const explicit = process.env.NOTIFY_STRATEGY as
    | NotifyStrategyName
    | undefined;
  if (
    explicit === "nats" ||
    explicit === "postgres" ||
    explicit === "polling"
  ) {
    return explicit;
  }

  // Auto-detect
  if (process.env.NATS_URL) return "nats";
  // Only native PostgreSQL supports LISTEN/NOTIFY (PGlite does not)
  if (database.type === "postgres") return "postgres";
  return "polling";
}
```

This is the same logic, but the comment now explicitly calls out WHY PGlite falls to polling.

## Step 4: Update the postgres case guard in createEventBus

The current guard on line 163 checks `database.type !== "postgres"`. This already handles PGlite correctly (PGlite is `"pglite"`, not `"postgres"`). Update the warning message to mention PGlite:

```typescript
    case "postgres": {
      if (database.type !== "postgres") {
        console.warn(
          "[EventBus] NOTIFY_STRATEGY=postgres requires a native PostgreSQL database (PGlite does not support LISTEN/NOTIFY), falling back to polling",
        );
        notifyStrategy = polling;
        break;
      }
      console.log("[EventBus] Using PostgreSQL LISTEN/NOTIFY strategy");
      notifyStrategy = compose(
        polling,
        new PostgresNotifyStrategy(database.db, database.pool),
      );
      break;
    }
```

## Step 5: Update module doc comment

Update the top-of-file comment in `apps/mesh/src/event-bus/index.ts` (lines 1-23) to mention PGlite:

```typescript
/**
 * Event Bus Module
 *
 * Provides a unified event bus for MCP Mesh.
 *
 * Architecture:
 * - EventBus: Single class handling publish/subscribe and worker management
 * - EventBusStorage: Database operations (unified via Kysely)
 * - EventBusWorker: Event processing and delivery logic (no internal polling)
 * - NotifyStrategy: Triggers worker processing (selected via NOTIFY_STRATEGY / NATS_URL env vars)
 *   - nats:     NatsNotifyStrategy + polling safety net
 *   - postgres: PostgresNotifyStrategy (LISTEN/NOTIFY) + polling safety net
 *   - polling:  PollingStrategy only (used for PGlite and SQLite)
 * - SSEBroadcastStrategy: Cross-pod SSE fan-out (selected alongside NotifyStrategy)
 *   - nats:     NatsSSEBroadcast (events replicated via NATS pub/sub)
 *   - default:  LocalSSEBroadcast (in-memory only, single process)
 *
 * Usage:
 * ```ts
 * const eventBus = createEventBus(database, config);
 * await eventBus.start();
 * ```
 */
```

## Step 6: Update polling.ts comment

Modify `apps/mesh/src/event-bus/polling.ts` top comment (lines 1-8):

```typescript
/**
 * Polling Notify Strategy
 *
 * A simple timer-based polling approach for triggering event processing.
 * The timer fires at regular intervals, triggering the worker to check for pending events.
 *
 * Use this when a pub/sub mechanism is not available (e.g., PGlite, SQLite).
 */
```

## Step 7: Run tests to verify they pass

Run: `bun test apps/mesh/src/event-bus/strategy-selection.test.ts`

Expected: PASS for all 6 tests

## Step 8: Run full event-bus test suite

Run: `bun test apps/mesh/src/event-bus/`

Expected: PASS (no regressions)

## Step 9: Run type check and lint

Run: `bun run check && bun run lint`

Expected: PASS

## Step 10: Format code

Run: `bun run fmt`

## Step 11: Commit

```bash
git add apps/mesh/src/event-bus/index.ts apps/mesh/src/event-bus/polling.ts apps/mesh/src/event-bus/strategy-selection.test.ts
git commit -m "feat(event-bus): update strategy selection for PGlite compatibility

PGlite (PostgreSQL-in-WASM) does not support LISTEN/NOTIFY, so it must
use PollingStrategy like SQLite. The auto-detection already works correctly
since PGlite has type 'pglite' (not 'postgres'), but this commit makes
the intent explicit with updated comments, an improved fallback warning,
and comprehensive tests for all strategy selection paths.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

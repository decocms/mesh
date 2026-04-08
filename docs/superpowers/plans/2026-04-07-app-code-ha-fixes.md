# Application Code HA Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the NATS re-subscription bug, add advisory locks to plugin migrations, tune NATS client settings, and align the shutdown timeout with the new 65s termination grace period.

**Architecture:** Targeted fixes to 3 files in `apps/mesh/src/`. Each task is independent and produces a working, testable change. TDD where tests exist; for infra-level code (NATS, migrations), manual verification steps.

**Tech Stack:** TypeScript, Bun test runner, NATS client (`nats` npm package), Kysely, PostgreSQL

---

### Task 1: Fix NatsNotifyStrategy Re-subscription Bug

**Files:**
- Modify: `apps/mesh/src/event-bus/nats-notify.ts`
- Test: `apps/mesh/src/event-bus/nats-notify.test.ts` (create if not exists)

**Context:** The `start()` method has `if (this.sub) return` on line 30. After NATS reconnects, the `NatsConnectionProvider` calls `fireReady()` which triggers `start()` again via the `onReady` callback. But the old `this.sub` is stale (its underlying connection is gone), so `start()` returns early and the subscription is never re-established. All event delivery silently falls back to 5s polling.

- [ ] **Step 1: Write a test for re-subscription after reconnect**

Create `apps/mesh/src/event-bus/nats-notify.test.ts`:

```typescript
import { describe, test, expect, mock } from "bun:test";
import { NatsNotifyStrategy } from "./nats-notify";
import type { NatsConnection, Subscription } from "nats";

function createMockConnection(): {
  nc: NatsConnection;
  subs: Subscription[];
} {
  const subs: Subscription[] = [];
  const nc = {
    subscribe: mock((subject: string) => {
      let resolveIterator: (() => void) | null = null;
      const sub: Subscription = {
        unsubscribe: mock(() => {
          resolveIterator?.();
        }),
        drain: mock(() => Promise.resolve()),
        isClosed: false,
        [Symbol.asyncIterator]: () => ({
          next: () =>
            new Promise<IteratorResult<unknown>>((resolve) => {
              resolveIterator = () =>
                resolve({ done: true, value: undefined });
            }),
          return: () => Promise.resolve({ done: true, value: undefined }),
          throw: () => Promise.resolve({ done: true, value: undefined }),
        }),
      } as unknown as Subscription;
      subs.push(sub);
      return sub;
    }),
    publish: mock(() => {}),
    isClosed: () => false,
    isDraining: () => false,
  } as unknown as NatsConnection;

  return { nc, subs };
}

describe("NatsNotifyStrategy", () => {
  test("start() creates subscription", async () => {
    const { nc } = createMockConnection();
    const strategy = new NatsNotifyStrategy({ getConnection: () => nc });

    await strategy.start(() => {});

    expect(nc.subscribe).toHaveBeenCalledTimes(1);
  });

  test("start() re-subscribes when called again (reconnect scenario)", async () => {
    const { nc, subs } = createMockConnection();
    const strategy = new NatsNotifyStrategy({ getConnection: () => nc });

    await strategy.start(() => {});
    expect(nc.subscribe).toHaveBeenCalledTimes(1);

    // Simulate reconnect: start() is called again
    await strategy.start();
    expect(nc.subscribe).toHaveBeenCalledTimes(2);
    // Old subscription should have been unsubscribed
    expect(subs[0].unsubscribe).toHaveBeenCalledTimes(1);
  });

  test("stop() cleans up subscription", async () => {
    const { nc, subs } = createMockConnection();
    const strategy = new NatsNotifyStrategy({ getConnection: () => nc });

    await strategy.start(() => {});
    await strategy.stop();

    expect(subs[0].unsubscribe).toHaveBeenCalledTimes(1);
  });

  test("notify() publishes to NATS", async () => {
    const { nc } = createMockConnection();
    const strategy = new NatsNotifyStrategy({ getConnection: () => nc });

    await strategy.notify("event-123");

    expect(nc.publish).toHaveBeenCalledTimes(1);
  });

  test("notify() publishes to correct subject", async () => {
    const { nc } = createMockConnection();
    const strategy = new NatsNotifyStrategy({ getConnection: () => nc });

    await strategy.notify("event-123");

    expect(nc.publish).toHaveBeenCalledWith(
      "mesh.events.notify",
      expect.any(Uint8Array),
    );
  });

  test("notify() silently succeeds when NATS is disconnected", async () => {
    const strategy = new NatsNotifyStrategy({ getConnection: () => null });

    // Should not throw
    await strategy.notify("event-123");
  });

  test("start() with no connection cleans up old sub but does not crash", async () => {
    const { nc, subs } = createMockConnection();
    const strategy = new NatsNotifyStrategy({ getConnection: () => nc });

    await strategy.start(() => {});
    expect(nc.subscribe).toHaveBeenCalledTimes(1);

    // Simulate NATS going away — getConnection returns null on reconnect attempt
    const strategyWithNull = new NatsNotifyStrategy({
      getConnection: () => null,
    });
    // This tests that start() handles null connection gracefully
    await strategyWithNull.start(() => {});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/mesh/src/event-bus/nats-notify.test.ts`

Expected: The "re-subscribes when called again" test FAILS because `start()` returns early on `if (this.sub) return`.

- [ ] **Step 3: Fix the bug — clean up stale subscription before re-subscribing**

In `apps/mesh/src/event-bus/nats-notify.ts`, replace lines 29-32:

```typescript
  async start(onNotify?: () => void): Promise<void> {
    if (this.sub) return;
    if (onNotify) this.onNotify = onNotify;
    if (!this.onNotify) return;
```

With:

```typescript
  async start(onNotify?: () => void): Promise<void> {
    if (onNotify) this.onNotify = onNotify;
    if (!this.onNotify) return;

    // Clean up stale subscription from previous connection (reconnect scenario).
    // After NATS reconnects, the old Subscription object is dead but non-null.
    if (this.sub) {
      try {
        this.sub.unsubscribe();
      } catch {
        // ignore — connection may already be closed
      }
      this.sub = null;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test apps/mesh/src/event-bus/nats-notify.test.ts`

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mesh/src/event-bus/nats-notify.ts apps/mesh/src/event-bus/nats-notify.test.ts
git commit -m "fix(event-bus): re-subscribe to NATS after reconnect

The start() method had an early return when this.sub was non-null,
preventing re-subscription after NATS reconnects. The old subscription
object was stale, silently breaking the notify path and forcing all
event delivery to fall back to 5s polling."
```

---

### Task 2: Add Advisory Lock to Plugin Migrations

**Files:**
- Modify: `apps/mesh/src/database/migrate.ts`

**Context:** `runPluginMigrations()` (line 149-213) queries and inserts into `plugin_migrations` without any locking. Two pods starting simultaneously can race: both read the same "executed" set, both try to run the same migration, and the INSERT of the record can conflict or worse — the DDL can run twice.

- [ ] **Step 1: Add advisory lock around plugin migration execution**

In `apps/mesh/src/database/migrate.ts`, modify the `runPluginMigrations` function. Replace lines 149-153:

```typescript
async function runPluginMigrations(db: Kysely<Database>): Promise<number> {
  const pluginMigrations = collectPluginMigrations();

  if (pluginMigrations.length === 0) {
    return 0;
  }
```

With:

```typescript
async function runPluginMigrations(db: Kysely<Database>): Promise<number> {
  const pluginMigrations = collectPluginMigrations();

  if (pluginMigrations.length === 0) {
    return 0;
  }

  // Use a transaction-scoped advisory lock to prevent concurrent execution.
  // Must use db.connection() to pin to a single connection (pool-safe).
  // Lock ID 73649281 is a fixed constant for plugin migrations.
  return await db.connection().execute(async (conn) => {
    await sql`SELECT pg_advisory_xact_lock(73649281)`.execute(conn);
```

Then, wrap the rest of the function body in a try/finally to release the lock. Replace lines 159-213 (the rest after the lock acquisition). The full function becomes:

```typescript
async function runPluginMigrations(db: Kysely<Database>): Promise<number> {
  const pluginMigrations = collectPluginMigrations();

  if (pluginMigrations.length === 0) {
    return 0;
  }

  // Use a transaction-scoped advisory lock to prevent concurrent execution.
  // Must use db.connection() to pin to a single connection (pool-safe).
  // Lock ID 73649281 is a fixed constant for plugin migrations.
  return await db.connection().execute(async (conn) => {
    await sql`SELECT pg_advisory_xact_lock(73649281)`.execute(conn);

    // Note: plugin_migrations table and old record migration are handled
    // in runKyselyMigrations() before Kysely's migrator runs

    // Get already executed migrations
    const executed = await sql<{ plugin_id: string; name: string }>`
      SELECT plugin_id, name FROM plugin_migrations
    `.execute(conn);
    const executedSet = new Set(
      executed.rows.map((r) => `${r.plugin_id}/${r.name}`),
    );

    // Group migrations by plugin
    const migrationsByPlugin = new Map<
      string,
      Array<{
        name: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        up: (db: any) => Promise<void>;
      }>
    >();

    for (const { pluginId, migration } of pluginMigrations) {
      if (!migrationsByPlugin.has(pluginId)) {
        migrationsByPlugin.set(pluginId, []);
      }
      migrationsByPlugin.get(pluginId)!.push({
        name: migration.name,
        up: migration.up,
      });
    }

    // Run pending migrations for each plugin
    let totalPending = 0;

    for (const [pluginId, pluginMigrationList] of migrationsByPlugin) {
      // Sort by name to ensure consistent order
      pluginMigrationList.sort((a, b) => a.name.localeCompare(b.name));

      for (const migration of pluginMigrationList) {
        const key = `${pluginId}/${migration.name}`;
        if (executedSet.has(key)) {
          continue; // Already executed
        }

        totalPending++;
        await migration.up(conn);

        // Record as executed
        const timestamp = new Date().toISOString();
        await sql`
          INSERT INTO plugin_migrations (plugin_id, name, timestamp)
          VALUES (${pluginId}, ${migration.name}, ${timestamp})
        `.execute(conn);
      }
    }

    return totalPending;
  });
  // Advisory lock is automatically released when the connection returns to pool.
}
```

- [ ] **Step 2: Run existing tests**

Run: `bun test apps/mesh/src/database/`

Expected: All existing tests pass (the advisory lock is transparent when there is no contention).

- [ ] **Step 3: Commit**

```bash
git add apps/mesh/src/database/migrate.ts
git commit -m "fix(database): add advisory lock to plugin migrations

Uses pg_advisory_xact_lock on a pinned connection to prevent race
conditions when multiple pods start simultaneously. Transaction-scoped
lock auto-releases on connection return, safe with connection poolers."
```

---

### Task 3: Align Shutdown Timeout with 65s Grace Period

**Files:**
- Modify: `apps/mesh/src/index.ts`

**Context:** The Helm chart's `terminationGracePeriodSeconds` is being changed from 60 to 65 (Task 2 of the Helm plan). A 5s preStop hook runs before SIGTERM. The app's internal force-exit timeout should increase from 55s to 58s so the timeline is: 5s preStop + SIGTERM + 58s app timeout = 63s < 65s grace period.

- [ ] **Step 1: Update the force-exit timeout**

In `apps/mesh/src/index.ts`, line 158-161, replace:

```typescript
  const forceExitTimer = setTimeout(() => {
    console.error("[shutdown] Timed out after 55s, forcing exit.");
    process.exit(1);
  }, 55_000);
```

With:

```typescript
  const forceExitTimer = setTimeout(() => {
    console.error("[shutdown] Timed out after 58s, forcing exit.");
    process.exit(1);
  }, 58_000);
```

- [ ] **Step 2: Verify the change**

Run: `grep -n "58_000\|58s" apps/mesh/src/index.ts`

Expected: Line ~161 shows the updated timeout.

- [ ] **Step 3: Run full test suite to verify no regressions**

Run: `bun test`

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mesh/src/index.ts
git commit -m "fix(shutdown): align force-exit timeout with 65s termination grace period

The Helm chart's terminationGracePeriodSeconds increases from 60 to 65
to accommodate a 5s preStop hook. The app's internal hard timeout
increases from 55s to 58s to stay within the grace period."
```

---

### Task 4: Tune NATS Client Connection Options

**Files:**
- Modify: `apps/mesh/src/nats/connection.ts`

**Context:** The `defaultConnect` function passes minimal options to the NATS client. Adding `pingInterval`, `reconnectJitter`, and a connection name improves dead-connection detection (120s default -> 60s) and prevents thundering herd on reconnect.

- [ ] **Step 1: Update defaultConnect with tuned options**

In `apps/mesh/src/nats/connection.ts`, replace lines 175-182:

```typescript
function defaultConnect(opts: {
  servers: string | string[];
  timeout: number;
  reconnect: boolean;
  maxReconnectAttempts: number;
}): Promise<NatsConnection> {
  return connect(opts);
}
```

With:

```typescript
function defaultConnect(opts: {
  servers: string | string[];
  timeout: number;
  reconnect: boolean;
  maxReconnectAttempts: number;
}): Promise<NatsConnection> {
  return connect({
    ...opts,
    pingInterval: 20_000,
    maxPingOut: 3,
    reconnectTimeWait: 1_000,
    reconnectJitter: 500,
    reconnectJitterTLS: 1_000,
    name: "mesh-app",
  });
}
```

- [ ] **Step 2: Run NATS-related tests**

Run: `bun test apps/mesh/src/nats/`

Expected: All tests pass. The mock `connectFn` in tests bypasses `defaultConnect`, so these options only affect real connections.

- [ ] **Step 3: Run full test suite**

Run: `bun test`

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/mesh/src/nats/connection.ts
git commit -m "feat(nats): tune client connection for faster dead-connection detection

- pingInterval: 20s (was 120s default) for faster dead connection detection
- reconnectJitter: 500ms to prevent thundering herd on reconnect
- connection name for debugging in NATS monitoring"
```

---

### Task 5: Format and Final Verification

- [ ] **Step 1: Run formatter**

Run: `bun run fmt`

- [ ] **Step 2: Run lint**

Run: `bun run lint`

- [ ] **Step 3: Run type check**

Run: `bun run check`

- [ ] **Step 4: Run full test suite**

Run: `bun test`

- [ ] **Step 5: Commit any formatting fixes**

```bash
git add -A
git commit -m "chore: format"
```

---

## Critique Decisions

**Adopted:**
- Fixed advisory lock to use `pg_advisory_xact_lock(73649281)` on a pinned connection via `db.connection().execute()` -- session-level `pg_advisory_lock` through a connection pool is broken because lock and unlock may execute on different connections. Also replaced `hashtext()` (undocumented internal PG function) with a hardcoded constant. (Correctness, Performance, Architecture, Documentation critics)
- Fixed mock async iterator to terminate `next()` when `unsubscribe()` is called, matching real NATS Subscription behavior (Testing critic)
- Added test for correct NATS subject in `notify()` (Testing critic)
- Added test for `start()` with null connection (Testing critic)

**Rejected:**
- Adding a staleness check (`this.sub.isClosed`) before re-subscribing -- the NATS `Subscription` interface does not reliably expose `isClosed` in all states. Unconditionally cleaning up is simpler and correct. The churn cost (one unsubscribe+subscribe per reconnect) is negligible. (Performance critic)
- Adding resilience test for NATS reconnect delivery latency -- valuable but out of scope for this plan. Filed as follow-up.
- Adding concurrent migration test with embedded Postgres -- the advisory lock fix is straightforward and the existing Kysely migration tests validate single-pod behavior. Concurrent testing would require significant test infrastructure. (Testing critic)

**Adapted:**
- NATS connection `name` kept static as `"mesh-app"` -- including pod hostname would require reading env vars at module init time which adds complexity. The static name is sufficient for distinguishing mesh app connections from other NATS clients. (Architecture critic)

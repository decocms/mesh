# Task 1: Add PGliteDatabase Type to MeshDatabase

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the `MeshDatabase` discriminated union with a `PGliteDatabase` variant so the event bus and other consumers can distinguish PGlite from native PostgreSQL.

**Architecture:** Add a new `"pglite"` type to `DatabaseType` and a `PGliteDatabase` interface. PGlite uses the same Kysely `Dialect` as PostgreSQL (PostgreSQL SQL dialect), but does NOT have a connection `Pool` and does NOT support `LISTEN/NOTIFY`. The database factory does NOT create PGlite databases yet (that's Section 1 work) - we only add the type definition and update type guards.

**Tech Stack:** TypeScript, Bun test runner

---

## Files

- Modify: `apps/mesh/src/database/index.ts` (lines 70-94)
- Create: `apps/mesh/src/database/index.test.ts`

---

## Step 1: Write the failing test for PGliteDatabase type

Create `apps/mesh/src/database/index.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import type { MeshDatabase, PGliteDatabase } from "./index";

describe("MeshDatabase types", () => {
  test("PGliteDatabase has type 'pglite' and db but no pool", () => {
    // Type-level test: PGliteDatabase should be assignable to MeshDatabase
    const pglite: PGliteDatabase = {
      type: "pglite",
      db: {} as any, // Kysely instance placeholder
    };
    const mesh: MeshDatabase = pglite;
    expect(mesh.type).toBe("pglite");
    expect(mesh).not.toHaveProperty("pool");
  });

  test("MeshDatabase discriminated union covers all three types", () => {
    function getDbType(db: MeshDatabase): string {
      switch (db.type) {
        case "sqlite":
          return "sqlite";
        case "postgres":
          return "postgres";
        case "pglite":
          return "pglite";
      }
    }

    const pglite: MeshDatabase = { type: "pglite", db: {} as any };
    expect(getDbType(pglite)).toBe("pglite");
  });
});
```

## Step 2: Run test to verify it fails

Run: `bun test apps/mesh/src/database/index.test.ts`

Expected: FAIL - `PGliteDatabase` is not exported from `./index`

## Step 3: Add PGliteDatabase type to MeshDatabase

Modify `apps/mesh/src/database/index.ts`:

**Change `DatabaseType` (line 70):**
```typescript
// Before:
export type DatabaseType = "sqlite" | "postgres";

// After:
export type DatabaseType = "sqlite" | "postgres" | "pglite";
```

**Add `PGliteDatabase` interface (after line 88, before `MeshDatabase` type):**
```typescript
/**
 * PGlite database connection (PostgreSQL compiled to WASM)
 * Uses PostgreSQL SQL dialect but runs in-process without a Pool.
 * Does NOT support LISTEN/NOTIFY.
 */
export interface PGliteDatabase {
  type: "pglite";
  db: Kysely<DatabaseSchema>;
}
```

**Update `MeshDatabase` union (line 94):**
```typescript
// Before:
export type MeshDatabase = SqliteDatabase | PostgresDatabase;

// After:
export type MeshDatabase = SqliteDatabase | PostgresDatabase | PGliteDatabase;
```

## Step 4: Run test to verify it passes

Run: `bun test apps/mesh/src/database/index.test.ts`

Expected: PASS

## Step 5: Fix any type errors introduced by the new union member

Run: `bun run check`

The new union member may cause exhaustiveness errors in switch statements that check `database.type`. These are GOOD - they show us every place that needs updating. Fix each one:

- If the code accesses `database.pool`, it should already be guarded by `database.type === "postgres"` check. If not, add the guard.
- If the code checks `database.type === "sqlite"`, consider whether PGlite should follow the same path or the postgres path. PGlite uses PostgreSQL SQL, so it should generally follow the `"postgres"` path for SQL dialect purposes. But for infrastructure concerns (LISTEN/NOTIFY, Pool), it behaves like `"sqlite"`.

**Expected places that may need updates:**
- `apps/mesh/src/event-bus/index.ts` - `resolveNotifyStrategy()` and `createEventBus()` (handled in Task 2)
- `apps/mesh/src/api/app.ts` - `createMeshContextFactory()` call passes `databaseType` (line 581)
- `apps/mesh/src/core/context-factory.ts` - receives `databaseType`

For now, just make the type checker pass. If `databaseType` is passed as `DatabaseType`, the consumer already accepts the union. Only fix actual type errors.

## Step 6: Run tests to verify nothing is broken

Run: `bun test apps/mesh/src/database/`

Expected: PASS

## Step 7: Run full type check

Run: `bun run check`

Expected: PASS (or only errors unrelated to this change)

## Step 8: Format code

Run: `bun run fmt`

## Step 9: Commit

```bash
git add apps/mesh/src/database/index.ts apps/mesh/src/database/index.test.ts
git commit -m "feat(database): add PGliteDatabase type to MeshDatabase union

Extends the MeshDatabase discriminated union with a 'pglite' variant.
PGlite uses PostgreSQL SQL dialect but runs in-process without a Pool
and does not support LISTEN/NOTIFY. This prepares the type system for
PGlite integration (Section 1) and event bus strategy selection (Section 2).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

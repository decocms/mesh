/**
 * Migration 070: Sandbox Prep Cache
 *
 * Tracks baked Docker images that carry a cloned repo + installed deps for a
 * given (user, repo, lockfile) tuple. The runner looks up the row on every
 * thread provision and — when `status='ready'` — spawns the thread container
 * from `image_tag` instead of running clone + install inline.
 *
 * Claim protocol: the in-process prep worker picks up `status='pending'` rows
 * using `SELECT ... FOR UPDATE SKIP LOCKED`, flips them to `'baking'`, runs
 * the bake, and writes `'ready'`/`'failed'` on exit. A row stuck in `'baking'`
 * longer than a threshold is reclaimed by the next worker pass.
 */

import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // `clone_url` is the unauthenticated canonical URL (e.g.
  // https://github.com/owner/repo.git) — it's what makes a row's identity
  // stable across OAuth token refreshes. The (repo_owner, repo_name,
  // connection_id) triple is what the worker re-feeds into
  // `buildCloneInfo()` to mint a fresh authenticated URL at bake time.
  await db.schema
    .createTable("sandbox_prep")
    .addColumn("prep_key", "text", (col) => col.notNull().primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("clone_url", "text", (col) => col.notNull())
    .addColumn("repo_owner", "text", (col) => col.notNull())
    .addColumn("repo_name", "text", (col) => col.notNull())
    .addColumn("connection_id", "text", (col) => col.notNull())
    .addColumn("lockfile_hash", "text")
    .addColumn("head_sha", "text")
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("image_tag", "text")
    .addColumn("error", "text")
    .addColumn("install_command", "text")
    .addColumn("claimed_at", "timestamptz")
    .addColumn("last_used_at", "timestamptz", (col) =>
      col.notNull().defaultTo("now()"),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo("now()"),
    )
    .execute();

  await db.schema
    .createIndex("sandbox_prep_user_clone_idx")
    .on("sandbox_prep")
    .columns(["user_id", "clone_url"])
    .execute();

  // Narrow index for the worker's claim query — only rows it actually scans.
  // Kysely's typed `.where()` on CreateIndexBuilder doesn't accept raw values
  // for arbitrary columns, so the predicate is inlined as raw SQL.
  await sql`
    CREATE INDEX sandbox_prep_pending_idx
    ON sandbox_prep (updated_at)
    WHERE status IN ('pending', 'baking')
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("sandbox_prep").execute();
}

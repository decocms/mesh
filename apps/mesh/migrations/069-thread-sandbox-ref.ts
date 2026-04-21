/**
 * Thread Sandbox Ref Migration
 *
 * Adds a `sandbox_ref` column to threads so the Docker sandbox runner can
 * key a shared container off the thread (bash tool + preview iframe hit
 * the same container). Nullable for legacy rows — null means "no sandbox
 * provisioned yet for this thread".
 */

import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("threads")
    .addColumn("sandbox_ref", "text")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("threads").dropColumn("sandbox_ref").execute();
}

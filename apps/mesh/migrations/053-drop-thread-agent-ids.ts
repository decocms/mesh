/**
 * Drop Thread Agent IDs Migration
 *
 * Rolls back migration 052 by dropping the `agent_ids` column from threads.
 * This is a forward migration to support rollback without running migration down.
 */

import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("threads").dropColumn("agent_ids").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("threads")
    .addColumn("agent_ids", "text", (col) => col.defaultTo("[]"))
    .execute();
}

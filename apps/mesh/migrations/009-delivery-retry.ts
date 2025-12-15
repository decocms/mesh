/**
 * Add next_retry_at column to event_deliveries table
 *
 * This enables exponential backoff for failed deliveries by storing
 * the timestamp when the next retry should be attempted.
 */

import { Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add next_retry_at column to event_deliveries
  await db.schema
    .alterTable("event_deliveries")
    .addColumn("next_retry_at", "text") // ISO 8601 timestamp
    .execute();

  // Create index for efficient retry polling
  await db.schema
    .createIndex("idx_deliveries_retry")
    .on("event_deliveries")
    .columns(["status", "next_retry_at"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_deliveries_retry").execute();
  await sql`ALTER TABLE event_deliveries DROP COLUMN next_retry_at`.execute(db);
}

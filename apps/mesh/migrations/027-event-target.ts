/**
 * Add target column to events table
 *
 * Allows events to be targeted to a specific connection.
 * When target is set, only subscriptions from that connection will receive the event.
 * When target is null, the event is broadcast to all matching subscriptions.
 */

import { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add target column to events table
  await db.schema
    .alterTable("events")
    .addColumn("target", "text") // Target connection ID (nullable = broadcast)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("events").dropColumn("target").execute();
}

/**
 * Converts event_subscriptions.enabled from integer (0/1) to boolean.
 *
 * The column was originally created as integer for SQLite compatibility,
 * but PostgreSQL requires proper boolean type for boolean comparisons.
 */

import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE event_subscriptions
    ALTER COLUMN enabled TYPE boolean
    USING enabled::boolean
  `.execute(db);

  await sql`
    ALTER TABLE event_subscriptions
    ALTER COLUMN enabled SET DEFAULT true
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE event_subscriptions
    ALTER COLUMN enabled TYPE integer
    USING enabled::integer
  `.execute(db);

  await sql`
    ALTER TABLE event_subscriptions
    ALTER COLUMN enabled SET DEFAULT 1
  `.execute(db);
}

/**
 * Migrate integer boolean columns to native BOOLEAN
 *
 * SQLite stored booleans as integers (0/1). Now that we use PGlite
 * (PostgreSQL), we can use native BOOLEAN columns.
 */

import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // monitoring_logs.is_error: integer → boolean
  await db.schema
    .alterTable("monitoring_logs")
    .alterColumn("is_error", (col) =>
      col.setDataType(sql`boolean using is_error::int::boolean`),
    )
    .execute();

  // event_subscriptions.enabled: integer → boolean
  // Must drop default first because PostgreSQL can't auto-cast the default
  await db.schema
    .alterTable("event_subscriptions")
    .alterColumn("enabled", (col) => col.dropDefault())
    .execute();
  await db.schema
    .alterTable("event_subscriptions")
    .alterColumn("enabled", (col) =>
      col.setDataType(sql`boolean using enabled::int::boolean`),
    )
    .execute();
  await db.schema
    .alterTable("event_subscriptions")
    .alterColumn("enabled", (col) => col.setDefault(true))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Reverse: boolean → integer
  await db.schema
    .alterTable("monitoring_logs")
    .alterColumn("is_error", (col) =>
      col.setDataType(sql`integer using is_error::boolean::int`),
    )
    .execute();

  await db.schema
    .alterTable("event_subscriptions")
    .alterColumn("enabled", (col) => col.dropDefault())
    .execute();
  await db.schema
    .alterTable("event_subscriptions")
    .alterColumn("enabled", (col) =>
      col.setDataType(sql`integer using enabled::boolean::int`),
    )
    .execute();
  await db.schema
    .alterTable("event_subscriptions")
    .alterColumn("enabled", (col) => col.setDefault(1))
    .execute();
}

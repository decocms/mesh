/**
 * Migration 069: Sandbox Environment Variables
 *
 * Per-sandbox user-defined env vars (secrets). Keyed by sandbox_ref so a
 * container recreation reprovisions with the same values — the runner passes
 * them to `docker run -e` at provision time, so they're scoped to the
 * container's lifecycle and never touch the image.
 *
 * Values are encrypted via the credential vault; the row only holds
 * ciphertext.
 */

import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("sandbox_env")
    .addColumn("sandbox_ref", "text", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.notNull())
    .addColumn("key", "text", (col) => col.notNull())
    .addColumn("value_encrypted", "text", (col) => col.notNull())
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo("now()"),
    )
    .addPrimaryKeyConstraint("sandbox_env_pkey", ["sandbox_ref", "key"])
    .execute();

  await db.schema
    .createIndex("sandbox_env_user_idx")
    .on("sandbox_env")
    .column("user_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("sandbox_env").execute();
}

import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE private_registry_item ADD COLUMN IF NOT EXISTS is_unlisted integer NOT NULL DEFAULT 0`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("private_registry_item")
    .dropColumn("is_unlisted")
    .execute();
}

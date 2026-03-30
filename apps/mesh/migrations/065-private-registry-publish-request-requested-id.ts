import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE private_registry_publish_request ADD COLUMN IF NOT EXISTS requested_id text`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("private_registry_publish_request")
    .dropColumn("requested_id")
    .execute();
}

import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("folders")
    .addColumn("type", "text", (col) => col.notNull().defaultTo("connections"))
    .execute();

  await db.schema
    .createIndex("folders_type_idx")
    .on("folders")
    .column("type")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("folders_type_idx").execute();
  await db.schema.alterTable("folders").dropColumn("type").execute();
}

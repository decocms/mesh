import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("brand_context")
    .addColumn("organization_id", "text", (col) =>
      col
        .primaryKey()
        .notNull()
        .references("organization.id")
        .onDelete("cascade"),
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("domain", "text", (col) => col.notNull())
    .addColumn("overview", "text", (col) => col.notNull())
    .addColumn("logo", "text")
    .addColumn("favicon", "text")
    .addColumn("og_image", "text")
    .addColumn("fonts", "text")
    .addColumn("colors", "text")
    .addColumn("images", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo("now()"),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo("now()"),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("brand_context").execute();
}

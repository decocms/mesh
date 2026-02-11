import { Kysely, sql } from "kysely";
import type { ServerPluginMigration } from "@decocms/bindings/server-plugin";

export const migration: ServerPluginMigration = {
  name: "001-private-registry",

  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable("private_registry_item")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("organization_id", "text", (col) =>
        col.notNull().references("organization.id").onDelete("cascade"),
      )
      .addColumn("title", "text", (col) => col.notNull())
      .addColumn("description", "text")
      .addColumn("server_json", "text", (col) => col.notNull())
      .addColumn("meta_json", "text")
      .addColumn("tags", "text")
      .addColumn("categories", "text")
      .addColumn("is_public", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("created_at", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn("updated_at", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn("created_by", "text", (col) =>
        col.references("user.id").onDelete("set null"),
      )
      .execute();

    await db.schema
      .createIndex("idx_private_registry_item_org")
      .on("private_registry_item")
      .column("organization_id")
      .execute();

    await db.schema
      .createIndex("idx_private_registry_item_org_public")
      .on("private_registry_item")
      .columns(["organization_id", "is_public"])
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .dropIndex("idx_private_registry_item_org_public")
      .ifExists()
      .execute();
    await db.schema
      .dropIndex("idx_private_registry_item_org")
      .ifExists()
      .execute();
    await db.schema.dropTable("private_registry_item").ifExists().execute();
  },
};

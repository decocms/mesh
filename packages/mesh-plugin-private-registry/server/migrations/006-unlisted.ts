import { Kysely } from "kysely";
import type { ServerPluginMigration } from "@decocms/bindings/server-plugin";

export const migration: ServerPluginMigration = {
  name: "006-unlisted",

  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable("private_registry_item")
      .addColumn("is_unlisted", "integer", (col) => col.notNull().defaultTo(0))
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable("private_registry_item")
      .dropColumn("is_unlisted")
      .execute();
  },
};

import type { Kysely } from "kysely";
import type { ServerPluginMigration } from "@decocms/bindings/server-plugin";

export const migration: ServerPluginMigration = {
  name: "004-publish-request-requested-id",

  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable("private_registry_publish_request")
      .addColumn("requested_id", "text")
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable("private_registry_publish_request")
      .dropColumn("requested_id")
      .execute();
  },
};

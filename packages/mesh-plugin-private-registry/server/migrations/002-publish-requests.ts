import { Kysely, sql } from "kysely";
import type { ServerPluginMigration } from "@decocms/bindings/server-plugin";

export const migration: ServerPluginMigration = {
  name: "002-publish-requests",

  async up(db: Kysely<unknown>): Promise<void> {
    // ── Publish requests table ──
    await db.schema
      .createTable("private_registry_publish_request")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("organization_id", "text", (col) =>
        col.notNull().references("organization.id").onDelete("cascade"),
      )
      .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
      .addColumn("title", "text", (col) => col.notNull())
      .addColumn("description", "text")
      .addColumn("server_json", "text", (col) => col.notNull())
      .addColumn("meta_json", "text")
      .addColumn("requester_name", "text")
      .addColumn("requester_email", "text")
      .addColumn("reviewer_notes", "text")
      .addColumn("created_at", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn("updated_at", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createIndex("idx_private_registry_publish_request_org_status")
      .on("private_registry_publish_request")
      .columns(["organization_id", "status"])
      .execute();

    // ── Publish API keys table ──
    await db.schema
      .createTable("private_registry_publish_api_key")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("organization_id", "text", (col) =>
        col.notNull().references("organization.id").onDelete("cascade"),
      )
      .addColumn("name", "text", (col) => col.notNull())
      .addColumn("key_hash", "text", (col) => col.notNull())
      .addColumn("prefix", "text", (col) => col.notNull())
      .addColumn("created_at", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createIndex("idx_private_registry_publish_api_key_org")
      .on("private_registry_publish_api_key")
      .columns(["organization_id"])
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .dropIndex("idx_private_registry_publish_api_key_org")
      .ifExists()
      .execute();
    await db.schema
      .dropTable("private_registry_publish_api_key")
      .ifExists()
      .execute();
    await db.schema
      .dropIndex("idx_private_registry_publish_request_org_status")
      .ifExists()
      .execute();
    await db.schema
      .dropTable("private_registry_publish_request")
      .ifExists()
      .execute();
  },
};

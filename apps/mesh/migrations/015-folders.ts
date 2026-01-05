/**
 * Folders Migration
 *
 * Adds folders table for organizing MCP connections and gateways.
 * Both connections and gateways can optionally belong to a folder.
 */

import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create folders table
  await db.schema
    .createTable("folders")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("organization_id", "text", (col) => col.notNull())
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("icon", "text")
    .addColumn("color", "text")
    .addColumn("sort_order", "integer", (col) => col.defaultTo(0))
    .addColumn("created_at", "text", (col) => col.notNull())
    .addColumn("updated_at", "text", (col) => col.notNull())
    .addColumn("created_by", "text", (col) => col.notNull())
    .execute();

  // Add folder_id to connections
  await db.schema
    .alterTable("connections")
    .addColumn("folder_id", "text")
    .execute();

  // Add folder_id to gateways
  await db.schema
    .alterTable("gateways")
    .addColumn("folder_id", "text")
    .execute();

  // Create index for faster folder queries
  await db.schema
    .createIndex("idx_folders_org")
    .on("folders")
    .column("organization_id")
    .execute();

  await db.schema
    .createIndex("idx_connections_folder")
    .on("connections")
    .column("folder_id")
    .execute();

  await db.schema
    .createIndex("idx_gateways_folder")
    .on("gateways")
    .column("folder_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop indexes
  await db.schema.dropIndex("idx_gateways_folder").execute();
  await db.schema.dropIndex("idx_connections_folder").execute();
  await db.schema.dropIndex("idx_folders_org").execute();

  // Remove folder_id from gateways
  await db.schema.alterTable("gateways").dropColumn("folder_id").execute();

  // Remove folder_id from connections
  await db.schema.alterTable("connections").dropColumn("folder_id").execute();

  // Drop folders table
  await db.schema.dropTable("folders").execute();
}

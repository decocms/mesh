/**
 * User Sandbox Plugin - Agents Linking Table
 *
 * Creates a linking table to enforce uniqueness of Virtual MCPs per (template, external_user_id).
 * This prevents race conditions when concurrent requests try to create agents for the same user.
 */

import { Kysely, sql } from "kysely";
import type { ServerPluginMigration } from "@decocms/bindings/server-plugin";

export const migration: ServerPluginMigration = {
  name: "002-user-sandbox-agents",

  async up(db: Kysely<unknown>): Promise<void> {
    // User Sandbox Agents linking table
    // Enforces one Virtual MCP (connection) per (template, external_user_id) pair
    await db.schema
      .createTable("user_sandbox_agents")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("user_sandbox_id", "text", (col) =>
        col.notNull().references("user_sandbox.id").onDelete("cascade"),
      )
      .addColumn("external_user_id", "text", (col) => col.notNull())
      .addColumn("connection_id", "text", (col) =>
        col.notNull().references("connections.id").onDelete("cascade"),
      )
      .addColumn("created_at", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    // UNIQUE constraint on (user_sandbox_id, external_user_id)
    // This is the key constraint that prevents race condition duplicates
    await db.schema
      .createIndex("idx_user_sandbox_agents_unique")
      .on("user_sandbox_agents")
      .columns(["user_sandbox_id", "external_user_id"])
      .unique()
      .execute();

    // Index for looking up agents by connection
    await db.schema
      .createIndex("idx_user_sandbox_agents_connection")
      .on("user_sandbox_agents")
      .column("connection_id")
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .dropIndex("idx_user_sandbox_agents_connection")
      .ifExists()
      .execute();
    await db.schema
      .dropIndex("idx_user_sandbox_agents_unique")
      .ifExists()
      .execute();
    await db.schema.dropTable("user_sandbox_agents").ifExists().execute();
  },
};

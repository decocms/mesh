import { Kysely, sql } from "kysely";
import type { ServerPluginMigration } from "@decocms/bindings/server-plugin";

export const migration: ServerPluginMigration = {
  name: "005-monitor-runs",

  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable("private_registry_monitor_run")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("organization_id", "text", (col) =>
        col.notNull().references("organization.id").onDelete("cascade"),
      )
      .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
      .addColumn("config_snapshot", "text")
      .addColumn("total_items", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("tested_items", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("passed_items", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("failed_items", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("skipped_items", "integer", (col) =>
        col.notNull().defaultTo(0),
      )
      .addColumn("current_item_id", "text")
      .addColumn("started_at", "text")
      .addColumn("finished_at", "text")
      .addColumn("created_at", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createIndex("idx_private_registry_monitor_run_org_created")
      .on("private_registry_monitor_run")
      .columns(["organization_id", "created_at"])
      .execute();

    await db.schema
      .createTable("private_registry_monitor_result")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("run_id", "text", (col) =>
        col
          .notNull()
          .references("private_registry_monitor_run.id")
          .onDelete("cascade"),
      )
      .addColumn("organization_id", "text", (col) =>
        col.notNull().references("organization.id").onDelete("cascade"),
      )
      .addColumn("item_id", "text", (col) => col.notNull())
      .addColumn("item_title", "text", (col) => col.notNull())
      .addColumn("status", "text", (col) => col.notNull())
      .addColumn("error_message", "text")
      .addColumn("connection_ok", "integer", (col) =>
        col.notNull().defaultTo(0),
      )
      .addColumn("tools_listed", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("tool_results", "text")
      .addColumn("agent_summary", "text")
      .addColumn("duration_ms", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("action_taken", "text", (col) =>
        col.notNull().defaultTo("none"),
      )
      .addColumn("tested_at", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createIndex("idx_private_registry_monitor_result_run")
      .on("private_registry_monitor_result")
      .columns(["run_id", "tested_at"])
      .execute();

    await db.schema
      .createIndex("idx_private_registry_monitor_result_run_status")
      .on("private_registry_monitor_result")
      .columns(["run_id", "status"])
      .execute();

    await db.schema
      .createTable("private_registry_monitor_connection")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("organization_id", "text", (col) =>
        col.notNull().references("organization.id").onDelete("cascade"),
      )
      .addColumn("item_id", "text", (col) => col.notNull())
      .addColumn("connection_id", "text", (col) =>
        col.notNull().references("connections.id").onDelete("cascade"),
      )
      .addColumn("auth_status", "text", (col) =>
        col.notNull().defaultTo("none"),
      )
      .addColumn("created_at", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn("updated_at", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createIndex("idx_private_registry_monitor_connection_org_item")
      .on("private_registry_monitor_connection")
      .columns(["organization_id", "item_id"])
      .unique()
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .dropIndex("idx_private_registry_monitor_connection_org_item")
      .ifExists()
      .execute();
    await db.schema
      .dropTable("private_registry_monitor_connection")
      .ifExists()
      .execute();

    await db.schema
      .dropIndex("idx_private_registry_monitor_result_run_status")
      .ifExists()
      .execute();
    await db.schema
      .dropIndex("idx_private_registry_monitor_result_run")
      .ifExists()
      .execute();
    await db.schema
      .dropTable("private_registry_monitor_result")
      .ifExists()
      .execute();

    await db.schema
      .dropIndex("idx_private_registry_monitor_run_org_created")
      .ifExists()
      .execute();
    await db.schema
      .dropTable("private_registry_monitor_run")
      .ifExists()
      .execute();
  },
};

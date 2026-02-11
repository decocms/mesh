/**
 * Monitoring Dashboards Migration
 *
 * Creates the monitoring_dashboards table for storing custom dashboards
 * with JSONPath-based widgets for aggregating monitoring data.
 */

import { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Create monitoring_dashboards table
  // CASCADE DELETE: When organization is deleted, dashboards are automatically removed
  await db.schema
    .createTable("monitoring_dashboards")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("organization_id", "text", (col) =>
      col.notNull().references("organization.id").onDelete("cascade"),
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("filters", "text") // JSON: { connectionIds?, virtualMcpIds?, toolNames? }
    .addColumn("widgets", "text", (col) => col.notNull()) // JSON array of widget definitions
    .addColumn("created_by", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) => col.notNull())
    .addColumn("updated_at", "text", (col) => col.notNull())
    .execute();

  // Create index for organization queries
  await db.schema
    .createIndex("monitoring_dashboards_org")
    .on("monitoring_dashboards")
    .columns(["organization_id"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop index first
  await db.schema.dropIndex("monitoring_dashboards_org").execute();

  // Drop table
  await db.schema.dropTable("monitoring_dashboards").execute();
}

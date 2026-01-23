/**
 * Migration: Add virtual_mcp_id to threads table
 *
 * Associates threads with the virtual MCP (agent) that was used when the thread was created.
 * This allows threads to display the correct agent icon and filter threads by agent.
 */

import { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add virtual_mcp_id column to threads table
  await db.schema
    .alterTable("threads")
    .addColumn("virtual_mcp_id", "text")
    .execute();

  // Create index for efficient filtering by virtual_mcp_id
  await db.schema
    .createIndex("idx_threads_virtual_mcp_id")
    .on("threads")
    .columns(["virtual_mcp_id"])
    .execute();

  // Create composite index for filtering by organization + virtual_mcp_id
  await db.schema
    .createIndex("idx_threads_org_virtual_mcp_id")
    .on("threads")
    .columns(["organization_id", "virtual_mcp_id"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop indexes first
  await db.schema.dropIndex("idx_threads_org_virtual_mcp_id").execute();
  await db.schema.dropIndex("idx_threads_virtual_mcp_id").execute();

  // Drop column
  await db.schema.alterTable("threads").dropColumn("virtual_mcp_id").execute();
}

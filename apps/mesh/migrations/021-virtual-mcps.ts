/**
 * Virtual MCPs Migration
 *
 * Renames gateway tables to virtual_mcps to align with the new Virtual MCP concept.
 * Virtual MCPs are a type of connection that aggregates tools from multiple connections.
 *
 * Changes:
 * - Rename `gateways` table to `virtual_mcps`
 * - Rename `gateway_connections` table to `virtual_mcp_connections`
 * - Update all indexes and foreign key references
 *
 * Note: Virtual connections use connection_url = "virtual://<virtual_mcp_id>" to reference
 * their virtual MCP definition. No additional column is needed.
 */

import { Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Step 1: Drop existing indexes on gateway tables
  // These will be recreated with new names after table rename
  await db.schema.dropIndex("idx_gateway_connections_unique").execute();
  await db.schema.dropIndex("idx_gateway_connections_connection").execute();
  await db.schema.dropIndex("idx_gateway_connections_gateway").execute();
  await db.schema.dropIndex("idx_gateways_org_status").execute();
  await db.schema.dropIndex("idx_gateways_org").execute();

  // Step 2: Rename gateways table to virtual_mcps
  await sql`ALTER TABLE gateways RENAME TO virtual_mcps`.execute(db);

  // Step 3: Rename gateway_connections table to virtual_mcp_connections
  await sql`ALTER TABLE gateway_connections RENAME TO virtual_mcp_connections`.execute(
    db,
  );

  // Step 4: Rename gateway_id column to virtual_mcp_id in virtual_mcp_connections
  await sql`ALTER TABLE virtual_mcp_connections RENAME COLUMN gateway_id TO virtual_mcp_id`.execute(
    db,
  );

  // Step 5: Recreate indexes with new names for virtual_mcps table
  await db.schema
    .createIndex("idx_virtual_mcps_org")
    .on("virtual_mcps")
    .columns(["organization_id"])
    .execute();

  await db.schema
    .createIndex("idx_virtual_mcps_org_status")
    .on("virtual_mcps")
    .columns(["organization_id", "status"])
    .execute();

  // Step 6: Recreate indexes for virtual_mcp_connections table
  await db.schema
    .createIndex("idx_virtual_mcp_connections_virtual_mcp")
    .on("virtual_mcp_connections")
    .columns(["virtual_mcp_id"])
    .execute();

  await db.schema
    .createIndex("idx_virtual_mcp_connections_connection")
    .on("virtual_mcp_connections")
    .columns(["connection_id"])
    .execute();

  await db.schema
    .createIndex("idx_virtual_mcp_connections_unique")
    .on("virtual_mcp_connections")
    .columns(["virtual_mcp_id", "connection_id"])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Step 1: Drop new indexes
  await db.schema.dropIndex("idx_virtual_mcp_connections_unique").execute();
  await db.schema.dropIndex("idx_virtual_mcp_connections_connection").execute();
  await db.schema
    .dropIndex("idx_virtual_mcp_connections_virtual_mcp")
    .execute();
  await db.schema.dropIndex("idx_virtual_mcps_org_status").execute();
  await db.schema.dropIndex("idx_virtual_mcps_org").execute();

  // Step 2: Rename virtual_mcp_id column back to gateway_id
  await sql`ALTER TABLE virtual_mcp_connections RENAME COLUMN virtual_mcp_id TO gateway_id`.execute(
    db,
  );

  // Step 3: Rename tables back
  await sql`ALTER TABLE virtual_mcp_connections RENAME TO gateway_connections`.execute(
    db,
  );
  await sql`ALTER TABLE virtual_mcps RENAME TO gateways`.execute(db);

  // Step 4: Recreate original indexes
  await db.schema
    .createIndex("idx_gateways_org")
    .on("gateways")
    .columns(["organization_id"])
    .execute();

  await db.schema
    .createIndex("idx_gateways_org_status")
    .on("gateways")
    .columns(["organization_id", "status"])
    .execute();

  await db.schema
    .createIndex("idx_gateway_connections_gateway")
    .on("gateway_connections")
    .columns(["gateway_id"])
    .execute();

  await db.schema
    .createIndex("idx_gateway_connections_connection")
    .on("gateway_connections")
    .columns(["connection_id"])
    .execute();

  await db.schema
    .createIndex("idx_gateway_connections_unique")
    .on("gateway_connections")
    .columns(["gateway_id", "connection_id"])
    .unique()
    .execute();
}

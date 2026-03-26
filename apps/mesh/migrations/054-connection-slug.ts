/**
 * Connection Slug Migration
 *
 * Adds a `slug` column to connections for efficient SQL-level filtering.
 * The slug is derived from app_name, connection_url, or title (in that order).
 * Backfills existing connections using the same logic as getConnectionSlug.
 */

import { type Kysely, sql } from "kysely";
import { getConnectionSlug } from "../src/shared/utils/connection-slug";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("connections").addColumn("slug", "text").execute();

  // Backfill slugs for existing connections
  const rows = (await sql`
    SELECT id, app_name, connection_url, title FROM connections
  `.execute(db)) as {
    rows: Array<{
      id: string;
      app_name: string | null;
      connection_url: string | null;
      title: string;
    }>;
  };

  for (const row of rows.rows) {
    const slug = getConnectionSlug(row);
    await sql`UPDATE connections SET slug = ${slug} WHERE id = ${row.id}`.execute(
      db,
    );
  }

  // Add index for slug lookups (filtered by org)
  await db.schema
    .createIndex("idx_connections_org_slug")
    .on("connections")
    .columns(["organization_id", "slug"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_connections_org_slug").execute();
  await db.schema.alterTable("connections").dropColumn("slug").execute();
}

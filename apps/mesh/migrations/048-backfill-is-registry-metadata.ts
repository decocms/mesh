/**
 * Backfill is_registry metadata flag on known registry connections
 *
 * The create/update tool handlers now set metadata.is_registry at save time
 * so the frontend can discover registries without fetching tools. This
 * migration backfills the flag for existing connections that are known
 * registries: the Deco Store (app_name = 'deco-registry') and the self
 * management MCP (app_name = '@deco/management-mcp').
 */

import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // metadata is stored as text (JSON string), not jsonb.
  // Cast to jsonb, merge, then cast back to text.
  await sql`
    UPDATE connections
    SET metadata = (COALESCE(metadata::jsonb, '{}'::jsonb) || '{"is_registry": true}'::jsonb)::text,
        updated_at = CURRENT_TIMESTAMP
    WHERE app_name IN ('deco-registry', '@deco/management-mcp')
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE connections
    SET metadata = (metadata::jsonb - 'is_registry')::text,
        updated_at = CURRENT_TIMESTAMP
    WHERE app_name IN ('deco-registry', '@deco/management-mcp')
  `.execute(db);
}

/**
 * Backfill is_registry + registry_list_tool metadata on known registry connections
 *
 * The create/update tool handlers now persist these flags at save time so the
 * frontend can discover registries and their list tool without fetching tools
 * from MCP servers. This migration backfills the flags for:
 *
 * 1. Deco Store (app_name = 'deco-registry') — always a registry,
 *    uses COLLECTION_REGISTRY_APP_LIST
 * 2. Community Registry (app_name = 'mcp-registry') — always a registry,
 *    uses COLLECTION_REGISTRY_APP_LIST
 * 3. Self MCP (app_name = '@deco/management-mcp') — only when the org has
 *    the 'private-registry' plugin enabled, uses REGISTRY_ITEM_LIST
 */

import { type Kysely, sql } from "kysely";

const REGISTRY_FLAGS =
  '{"is_registry": true, "registry_list_tool": "COLLECTION_REGISTRY_APP_LIST"}';

const PRIVATE_REGISTRY_FLAGS =
  '{"is_registry": true, "registry_list_tool": "REGISTRY_ITEM_LIST"}';

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Deco Store — always a registry
  await sql`
    UPDATE connections
    SET metadata = (COALESCE(metadata::jsonb, '{}'::jsonb) || ${sql.lit(REGISTRY_FLAGS)}::jsonb)::text,
        updated_at = CURRENT_TIMESTAMP
    WHERE app_name = 'deco-registry'
  `.execute(db);

  // 2. Community Registry — always a registry
  await sql`
    UPDATE connections
    SET metadata = (COALESCE(metadata::jsonb, '{}'::jsonb) || ${sql.lit(REGISTRY_FLAGS)}::jsonb)::text,
        updated_at = CURRENT_TIMESTAMP
    WHERE app_name = 'mcp-registry'
  `.execute(db);

  // 3. Self MCP — only when private-registry plugin is enabled
  // Note: organization_settings uses camelCase column "organizationId" (quoted).
  await sql`
    UPDATE connections
    SET metadata = (COALESCE(metadata::jsonb, '{}'::jsonb) || ${sql.lit(PRIVATE_REGISTRY_FLAGS)}::jsonb)::text,
        updated_at = CURRENT_TIMESTAMP
    WHERE app_name = '@deco/management-mcp'
      AND organization_id IN (
        SELECT "organizationId" FROM organization_settings
        WHERE enabled_plugins IS NOT NULL
          AND enabled_plugins LIKE '%private-registry%'
        UNION
        SELECT organization_id FROM projects
        WHERE enabled_plugins IS NOT NULL
          AND enabled_plugins LIKE '%private-registry%'
      )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    UPDATE connections
    SET metadata = ((metadata::jsonb - 'is_registry') - 'registry_list_tool')::text,
        updated_at = CURRENT_TIMESTAMP
    WHERE app_name IN ('deco-registry', 'mcp-registry', '@deco/management-mcp')
      AND metadata IS NOT NULL
      AND metadata LIKE '%is_registry%'
  `.execute(db);
}

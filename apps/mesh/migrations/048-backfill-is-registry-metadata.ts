/**
 * Backfill is_registry metadata flag on known registry connections
 *
 * The create/update tool handlers now set metadata.is_registry at save time
 * so the frontend can discover registries without fetching tools. This
 * migration backfills the flag for:
 *
 * 1. Deco Store connections (app_name = 'deco-registry') — always a registry
 * 2. Self MCP connections (app_name = '@deco/management-mcp') — only when the
 *    organization has the 'private-registry' plugin enabled (checked via
 *    organization_settings.enabled_plugins or projects.enabled_plugins)
 */

import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Deco Store is always a registry
  await sql`
    UPDATE connections
    SET metadata = (COALESCE(metadata::jsonb, '{}'::jsonb) || '{"is_registry": true}'::jsonb)::text,
        updated_at = CURRENT_TIMESTAMP
    WHERE app_name = 'deco-registry'
  `.execute(db);

  // 2. Self MCP is a registry only when private-registry plugin is enabled.
  // Check both organization_settings and projects tables for the plugin.
  // Note: organization_settings uses camelCase column "organizationId" (quoted).
  await sql`
    UPDATE connections
    SET metadata = (COALESCE(metadata::jsonb, '{}'::jsonb) || '{"is_registry": true}'::jsonb)::text,
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
    SET metadata = (metadata::jsonb - 'is_registry')::text,
        updated_at = CURRENT_TIMESTAMP
    WHERE app_name IN ('deco-registry', '@deco/management-mcp')
      AND metadata IS NOT NULL
      AND metadata LIKE '%is_registry%'
  `.execute(db);
}

/**
 * Rename "Mesh MCP" to "CMS MCP" and Reset Tools Cache
 *
 * This migration:
 * 1. Renames the self-management MCP title from "Mesh MCP" to "CMS MCP"
 *    to align with the Deco CMS rebranding.
 * 2. Resets the `tools` column to NULL so the tool cache is regenerated
 *    from the management MCP endpoint.
 *
 * Setting tools to NULL causes the proxy to fall back to fetching tools
 * directly from the MCP endpoint on next request.
 */

import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Rename title and clear tools cache for all management MCP connections
  await sql`
    UPDATE connections
    SET title = 'CMS MCP',
        tools = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE app_name = '@deco/management-mcp'
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Revert title back to "Mesh MCP"
  // Note: tools will remain NULL (they'll be fetched fresh on next request)
  await sql`
    UPDATE connections
    SET title = 'Mesh MCP',
        updated_at = CURRENT_TIMESTAMP
    WHERE app_name = '@deco/management-mcp'
  `.execute(db);
}

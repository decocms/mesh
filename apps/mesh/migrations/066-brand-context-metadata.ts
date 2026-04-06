import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Add metadata JSON column to brand_context for rich design tokens
 * (typography, components, spacing, layout, tone, etc.)
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  const cols = await sql<{ column_name: string }>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'brand_context' AND column_name = 'metadata'
  `.execute(db);

  if (cols.rows.length > 0) return;

  await sql`ALTER TABLE brand_context ADD COLUMN metadata text`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE brand_context DROP COLUMN IF EXISTS metadata`.execute(
    db,
  );
}

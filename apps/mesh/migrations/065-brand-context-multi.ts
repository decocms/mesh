import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Migrate brand_context from 1:1 (organization_id as PK) to N:1 (id as PK).
 * Handles both cases:
 * - Fresh DB: table already has id column from 064 → no-op
 * - Existing DB: old 064 ran with organization_id as PK → alter table
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // Check if the 'id' column already exists (fresh DB with new 064)
  const cols = await sql<{ column_name: string }>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'brand_context' AND column_name = 'id'
  `.execute(db);

  if (cols.rows.length > 0) {
    // Table already has id column — new 064 ran, nothing to do
    return;
  }

  // Old 064 ran: organization_id is the PK, no id column.
  // Drop PK constraint, add id column, backfill, set new PK, add index.
  await sql`ALTER TABLE brand_context DROP CONSTRAINT brand_context_pkey`.execute(
    db,
  );
  await sql`ALTER TABLE brand_context ADD COLUMN id text`.execute(db);
  await sql`UPDATE brand_context SET id = gen_random_uuid()::text WHERE id IS NULL`.execute(
    db,
  );
  await sql`ALTER TABLE brand_context ALTER COLUMN id SET NOT NULL`.execute(db);
  await sql`ALTER TABLE brand_context ADD PRIMARY KEY (id)`.execute(db);

  // Add FK constraint if missing
  await sql`
    ALTER TABLE brand_context
    ADD CONSTRAINT brand_context_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES organization(id) ON DELETE CASCADE
  `.execute(db);

  // Add index on organization_id
  await db.schema
    .createIndex("brand_context_organization_id_idx")
    .on("brand_context")
    .column("organization_id")
    .ifNotExists()
    .execute();
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // Not reversible cleanly — the original 064 down drops the whole table
}

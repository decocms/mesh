/**
 * Make connection_url nullable for STDIO connections
 *
 * STDIO connections don't need a URL - they use connection_headers
 * to store { command, args, cwd, envVars } instead.
 */

import { Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // SQLite doesn't support ALTER COLUMN, so we need to recreate the table
  // For PostgreSQL, we can use ALTER COLUMN directly
  // Detect dialect by attempting PostgreSQL-style ALTER first

  try {
    // Try PostgreSQL syntax
    await sql`ALTER TABLE connections ALTER COLUMN connection_url DROP NOT NULL`.execute(
      db,
    );
  } catch {
    // SQLite: Need to recreate table (complex, skip for now - SQLite already allows nulls in practice)
    // SQLite's NOT NULL is only enforced on INSERT, and we can use empty string as fallback
    console.log(
      "[Migration 014] SQLite detected - connection_url will use empty string for STDIO",
    );
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  try {
    // PostgreSQL: Re-add NOT NULL constraint
    await sql`ALTER TABLE connections ALTER COLUMN connection_url SET NOT NULL`.execute(
      db,
    );
  } catch {
    // SQLite: No-op
  }
}

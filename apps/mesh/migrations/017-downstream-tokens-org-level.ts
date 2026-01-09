/**
 * Migration 017: Clean up user-specific downstream tokens
 *
 * The downstream_tokens table was incorrectly storing tokens per-user instead of
 * per-connection (org-level). This migration:
 * 1. Deletes all tokens where userId is NOT NULL (user-specific tokens)
 * 2. Keeps org-level tokens (userId IS NULL) intact
 *
 * After this migration, new tokens will only be stored at the org level (userId = NULL).
 *
 * Note: This is a one-way migration. Users who had personal OAuth tokens will need
 * to re-authenticate. The token will then be shared across the organization.
 */

import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Delete all user-specific tokens (userId is not null)
  // These were created by the buggy PR that associated tokens with users
  await sql`DELETE FROM downstream_tokens WHERE userId IS NOT NULL`.execute(db);
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // No way to restore deleted tokens - this is a one-way data migration
  // The down migration is a no-op
}

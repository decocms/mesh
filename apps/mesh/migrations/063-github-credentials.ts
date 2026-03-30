/**
 * GitHub Credentials Migration
 *
 * Stores GitHub OAuth access tokens per user, encrypted at rest via the vault.
 * Scoped to the user (not the org) since a GitHub OAuth token is a personal
 * authorization that spans all orgs the user belongs to.
 */

import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("github_credentials")
    .addColumn("user_id", "text", (col) => col.primaryKey())
    .addColumn("access_token", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("github_credentials").execute();
}

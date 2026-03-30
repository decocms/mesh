/**
 * Adds installation_id to github_credentials and makes access_token nullable.
 *
 * When using the GitHub App installation flow without OAuth, we store the
 * installation_id instead of a user access token. The installation_id is used
 * to generate short-lived installation access tokens via the GitHub App JWT.
 */

import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("github_credentials")
    .addColumn("installation_id", "text")
    .execute();

  await sql`ALTER TABLE github_credentials ALTER COLUMN access_token DROP NOT NULL`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE github_credentials ALTER COLUMN access_token SET NOT NULL`.execute(
    db,
  );

  await db.schema
    .alterTable("github_credentials")
    .dropColumn("installation_id")
    .execute();
}

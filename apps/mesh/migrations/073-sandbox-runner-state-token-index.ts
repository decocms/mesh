/**
 * Btree index on `sandbox_runner_state.state->>'token'` so the
 * sandbox-user-data bearer middleware can resolve a DAEMON_TOKEN to its
 * sandbox row in O(log n) instead of scanning every active sandbox.
 */

import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE INDEX IF NOT EXISTS sandbox_runner_state_token_idx
    ON sandbox_runner_state ((state ->> 'token'))
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS sandbox_runner_state_token_idx`.execute(db);
}

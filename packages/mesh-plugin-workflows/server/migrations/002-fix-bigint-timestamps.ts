/**
 * Workflows Plugin - Fix Timestamp Columns
 *
 * Changes integer columns to bigint for epoch millisecond timestamps.
 * JavaScript timestamps (Date.now()) exceed 32-bit integer range.
 */

import { Kysely, sql } from "kysely";
import type { ServerPluginMigration } from "@decocms/bindings/server-plugin";

export const migration: ServerPluginMigration = {
  name: "002-fix-bigint-timestamps",

  async up(db: Kysely<unknown>): Promise<void> {
    // workflow table
    await sql`ALTER TABLE workflow ALTER COLUMN created_at_epoch_ms TYPE bigint`.execute(
      db,
    );

    // workflow_execution table
    await sql`ALTER TABLE workflow_execution ALTER COLUMN created_at TYPE bigint`.execute(
      db,
    );
    await sql`ALTER TABLE workflow_execution ALTER COLUMN updated_at TYPE bigint`.execute(
      db,
    );
    await sql`ALTER TABLE workflow_execution ALTER COLUMN start_at_epoch_ms TYPE bigint`.execute(
      db,
    );
    await sql`ALTER TABLE workflow_execution ALTER COLUMN started_at_epoch_ms TYPE bigint`.execute(
      db,
    );
    await sql`ALTER TABLE workflow_execution ALTER COLUMN completed_at_epoch_ms TYPE bigint`.execute(
      db,
    );
    await sql`ALTER TABLE workflow_execution ALTER COLUMN timeout_ms TYPE bigint`.execute(
      db,
    );
    await sql`ALTER TABLE workflow_execution ALTER COLUMN deadline_at_epoch_ms TYPE bigint`.execute(
      db,
    );

    // workflow_execution_step_result table
    await sql`ALTER TABLE workflow_execution_step_result ALTER COLUMN started_at_epoch_ms TYPE bigint`.execute(
      db,
    );
    await sql`ALTER TABLE workflow_execution_step_result ALTER COLUMN completed_at_epoch_ms TYPE bigint`.execute(
      db,
    );
  },

  async down(db: Kysely<unknown>): Promise<void> {
    // Revert to integer (will fail if values exceed integer range)
    await sql`ALTER TABLE workflow ALTER COLUMN created_at_epoch_ms TYPE integer`.execute(
      db,
    );

    await sql`ALTER TABLE workflow_execution ALTER COLUMN created_at TYPE integer`.execute(
      db,
    );
    await sql`ALTER TABLE workflow_execution ALTER COLUMN updated_at TYPE integer`.execute(
      db,
    );
    await sql`ALTER TABLE workflow_execution ALTER COLUMN start_at_epoch_ms TYPE integer`.execute(
      db,
    );
    await sql`ALTER TABLE workflow_execution ALTER COLUMN started_at_epoch_ms TYPE integer`.execute(
      db,
    );
    await sql`ALTER TABLE workflow_execution ALTER COLUMN completed_at_epoch_ms TYPE integer`.execute(
      db,
    );
    await sql`ALTER TABLE workflow_execution ALTER COLUMN timeout_ms TYPE integer`.execute(
      db,
    );
    await sql`ALTER TABLE workflow_execution ALTER COLUMN deadline_at_epoch_ms TYPE integer`.execute(
      db,
    );

    await sql`ALTER TABLE workflow_execution_step_result ALTER COLUMN started_at_epoch_ms TYPE integer`.execute(
      db,
    );
    await sql`ALTER TABLE workflow_execution_step_result ALTER COLUMN completed_at_epoch_ms TYPE integer`.execute(
      db,
    );
  },
};

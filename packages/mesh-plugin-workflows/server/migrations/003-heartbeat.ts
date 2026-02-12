/**
 * Workflows Plugin - Add Heartbeat Column
 *
 * Adds heartbeat_at_epoch_ms to workflow_execution for runtime stuck detection.
 * The orchestrator updates this column between steps so a background sweeper
 * can detect executions that have stopped making progress.
 */

import { Kysely, sql } from "kysely";
import type { ServerPluginMigration } from "@decocms/bindings/server-plugin";

export const migration: ServerPluginMigration = {
  name: "003-heartbeat",

  async up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE workflow_execution ADD COLUMN heartbeat_at_epoch_ms bigint`.execute(
      db,
    );
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE workflow_execution DROP COLUMN heartbeat_at_epoch_ms`.execute(
      db,
    );
  },
};

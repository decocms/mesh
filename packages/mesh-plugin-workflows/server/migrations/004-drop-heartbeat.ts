/**
 * Workflows Plugin - Drop Heartbeat Column
 *
 * Removes heartbeat_at_epoch_ms from workflow_execution.
 * The heartbeat mechanism is replaced by relying on step-level timeouts
 * (tool call timeout + QuickJS interruptAfterMs) and startup recovery.
 */

import { Kysely, sql } from "kysely";
import type { ServerPluginMigration } from "@decocms/bindings/server-plugin";

export const migration: ServerPluginMigration = {
  name: "004-drop-heartbeat",

  async up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE workflow_execution DROP COLUMN heartbeat_at_epoch_ms`.execute(
      db,
    );
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE workflow_execution ADD COLUMN heartbeat_at_epoch_ms bigint`.execute(
      db,
    );
  },
};

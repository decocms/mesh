/**
 * Workflows Plugin - Add Raw Tool Output Column
 *
 * Adds raw_tool_output to workflow_execution_step_result to checkpoint
 * the raw MCP tool output before any transform code runs.
 * This ensures the original tool result is preserved even if the
 * transform step fails.
 */

import { Kysely, sql } from "kysely";
import type { ServerPluginMigration } from "@decocms/bindings/server-plugin";

export const migration: ServerPluginMigration = {
  name: "005-raw-tool-output",

  async up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE workflow_execution_step_result ADD COLUMN raw_tool_output text`.execute(
      db,
    );
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE workflow_execution_step_result DROP COLUMN raw_tool_output`.execute(
      db,
    );
  },
};

/**
 * Gateway System Prompt Migration
 *
 * Adds a system_prompt column to the gateways table.
 */

import { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add system_prompt column to the gateways table
  await db.schema
    .alterTable("gateways")
    .addColumn("system_prompt", "text")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop system_prompt column from the gateways table
  await db.schema.alterTable("gateways").dropColumn("system_prompt").execute();
}

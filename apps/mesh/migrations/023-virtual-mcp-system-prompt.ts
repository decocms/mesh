import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("virtual_mcps")
    .addColumn("system_prompt", "text")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("virtual_mcps")
    .dropColumn("system_prompt")
    .execute();
}


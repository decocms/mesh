/**
 * Tools, Resources, and Prompts Collections
 *
 * Adds collection tables for stored tools/resources/prompts and
 * gateway join tables for selecting them in agents.
 */

import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // Stored tools
  await db.schema
    .createTable("tools")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("organization_id", "text", (col) =>
      col.notNull().references("organization.id").onDelete("cascade"),
    )
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("input_schema", "text", (col) => col.notNull())
    .addColumn("output_schema", "text")
    .addColumn("execute", "text", (col) => col.notNull())
    .addColumn("dependencies", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("created_by", "text", (col) =>
      col.notNull().references("user.id").onDelete("cascade"),
    )
    .addColumn("updated_by", "text")
    .execute();

  // Stored resources
  await db.schema
    .createTable("resources")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("organization_id", "text", (col) =>
      col.notNull().references("organization.id").onDelete("cascade"),
    )
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("uri", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("mime_type", "text")
    .addColumn("text", "text")
    .addColumn("blob", "text")
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("created_by", "text", (col) =>
      col.notNull().references("user.id").onDelete("cascade"),
    )
    .addColumn("updated_by", "text")
    .execute();

  // Stored prompts
  await db.schema
    .createTable("prompts")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("organization_id", "text", (col) =>
      col.notNull().references("organization.id").onDelete("cascade"),
    )
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("template", "text")
    .addColumn("arguments", "text")
    .addColumn("icons", "text")
    .addColumn("messages", "text")
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("created_by", "text", (col) =>
      col.notNull().references("user.id").onDelete("cascade"),
    )
    .addColumn("updated_by", "text")
    .execute();

  // Gateway join tables
  await db.schema
    .createTable("gateway_tools")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("gateway_id", "text", (col) =>
      col.notNull().references("gateways.id").onDelete("cascade"),
    )
    .addColumn("tool_id", "text", (col) =>
      col.notNull().references("tools.id").onDelete("cascade"),
    )
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createTable("gateway_resources")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("gateway_id", "text", (col) =>
      col.notNull().references("gateways.id").onDelete("cascade"),
    )
    .addColumn("resource_id", "text", (col) =>
      col.notNull().references("resources.id").onDelete("cascade"),
    )
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createTable("gateway_prompts")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("gateway_id", "text", (col) =>
      col.notNull().references("gateways.id").onDelete("cascade"),
    )
    .addColumn("prompt_id", "text", (col) =>
      col.notNull().references("prompts.id").onDelete("cascade"),
    )
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Indexes
  await db.schema
    .createIndex("idx_tools_org")
    .on("tools")
    .columns(["organization_id"])
    .execute();
  await db.schema
    .createIndex("idx_tools_org_name")
    .on("tools")
    .columns(["organization_id", "name"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_resources_org")
    .on("resources")
    .columns(["organization_id"])
    .execute();
  await db.schema
    .createIndex("idx_resources_org_uri")
    .on("resources")
    .columns(["organization_id", "uri"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_prompts_org")
    .on("prompts")
    .columns(["organization_id"])
    .execute();
  await db.schema
    .createIndex("idx_prompts_org_name")
    .on("prompts")
    .columns(["organization_id", "name"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_gateway_tools_gateway")
    .on("gateway_tools")
    .columns(["gateway_id"])
    .execute();
  await db.schema
    .createIndex("idx_gateway_tools_tool")
    .on("gateway_tools")
    .columns(["tool_id"])
    .execute();
  await db.schema
    .createIndex("idx_gateway_tools_unique")
    .on("gateway_tools")
    .columns(["gateway_id", "tool_id"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_gateway_resources_gateway")
    .on("gateway_resources")
    .columns(["gateway_id"])
    .execute();
  await db.schema
    .createIndex("idx_gateway_resources_resource")
    .on("gateway_resources")
    .columns(["resource_id"])
    .execute();
  await db.schema
    .createIndex("idx_gateway_resources_unique")
    .on("gateway_resources")
    .columns(["gateway_id", "resource_id"])
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_gateway_prompts_gateway")
    .on("gateway_prompts")
    .columns(["gateway_id"])
    .execute();
  await db.schema
    .createIndex("idx_gateway_prompts_prompt")
    .on("gateway_prompts")
    .columns(["prompt_id"])
    .execute();
  await db.schema
    .createIndex("idx_gateway_prompts_unique")
    .on("gateway_prompts")
    .columns(["gateway_id", "prompt_id"])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_gateway_prompts_unique").execute();
  await db.schema.dropIndex("idx_gateway_prompts_prompt").execute();
  await db.schema.dropIndex("idx_gateway_prompts_gateway").execute();
  await db.schema.dropIndex("idx_gateway_resources_unique").execute();
  await db.schema.dropIndex("idx_gateway_resources_resource").execute();
  await db.schema.dropIndex("idx_gateway_resources_gateway").execute();
  await db.schema.dropIndex("idx_gateway_tools_unique").execute();
  await db.schema.dropIndex("idx_gateway_tools_tool").execute();
  await db.schema.dropIndex("idx_gateway_tools_gateway").execute();
  await db.schema.dropIndex("idx_prompts_org_name").execute();
  await db.schema.dropIndex("idx_prompts_org").execute();
  await db.schema.dropIndex("idx_resources_org_uri").execute();
  await db.schema.dropIndex("idx_resources_org").execute();
  await db.schema.dropIndex("idx_tools_org_name").execute();
  await db.schema.dropIndex("idx_tools_org").execute();

  await db.schema.dropTable("gateway_prompts").execute();
  await db.schema.dropTable("gateway_resources").execute();
  await db.schema.dropTable("gateway_tools").execute();
  await db.schema.dropTable("prompts").execute();
  await db.schema.dropTable("resources").execute();
  await db.schema.dropTable("tools").execute();
}

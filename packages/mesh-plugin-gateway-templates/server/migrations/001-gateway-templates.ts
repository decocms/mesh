/**
 * Gateway Templates Plugin - Database Schema
 *
 * Creates tables for:
 * - gateway_templates: Template definitions with required apps and completion config
 * - gateway_template_sessions: Per-user session state for the connect flow
 */

import { Kysely, sql } from "kysely";
import type { ServerPluginMigration } from "@decocms/bindings/server-plugin";

export const migration: ServerPluginMigration = {
  name: "001-gateway-templates",

  async up(db: Kysely<unknown>): Promise<void> {
    // Gateway Templates table
    // Defines a template that platforms can use to create integration flows
    await db.schema
      .createTable("gateway_templates")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("organization_id", "text", (col) =>
        col.notNull().references("organization.id").onDelete("cascade"),
      )
      .addColumn("title", "text", (col) => col.notNull())
      .addColumn("description", "text")
      .addColumn("icon", "text")
      // Required apps from registry (JSON array)
      // Format: [{ app_name: "@deco/gmail", selected_tools: ["send_email"], ... }]
      .addColumn("required_apps", "text", (col) => col.notNull())
      // Completion configuration
      .addColumn("redirect_url", "text")
      .addColumn("webhook_url", "text")
      .addColumn("event_type", "text", (col) =>
        col.notNull().defaultTo("integration.completed"),
      )
      // Agent configuration
      .addColumn("agent_title_template", "text", (col) =>
        col.notNull().defaultTo("Agent for {{externalUserId}}"),
      )
      .addColumn("agent_instructions", "text")
      .addColumn("tool_selection_mode", "text", (col) =>
        col.notNull().defaultTo("inclusion"),
      )
      // Status
      .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
      // Audit fields
      .addColumn("created_at", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn("updated_at", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn("created_by", "text", (col) =>
        col.references("user.id").onDelete("set null"),
      )
      .execute();

    // Index for listing templates by organization
    await db.schema
      .createIndex("idx_gateway_templates_org")
      .on("gateway_templates")
      .column("organization_id")
      .execute();

    // Gateway Template Sessions table
    // Tracks per-user state during the connect flow
    await db.schema
      .createTable("gateway_template_sessions")
      .addColumn("id", "text", (col) => col.primaryKey())
      .addColumn("template_id", "text", (col) =>
        col.notNull().references("gateway_templates.id").onDelete("cascade"),
      )
      .addColumn("organization_id", "text", (col) =>
        col.notNull().references("organization.id").onDelete("cascade"),
      )
      // External user ID from the platform's system
      .addColumn("external_user_id", "text", (col) => col.notNull())
      // Session state
      .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
      // Per-app configuration status (JSON)
      // Format: { "@deco/gmail": { configured: true, connection_id: "conn_xxx" }, ... }
      .addColumn("app_statuses", "text", (col) => col.notNull().defaultTo("{}"))
      // Created agent ID (set on completion)
      .addColumn("created_agent_id", "text", (col) =>
        col.references("connections.id").onDelete("set null"),
      )
      // Snapshot of redirect_url from template at session creation
      .addColumn("redirect_url", "text")
      // Audit fields
      .addColumn("created_at", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn("updated_at", "text", (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      // Session expiration (default 7 days from creation)
      .addColumn("expires_at", "text", (col) => col.notNull())
      .execute();

    // Index for finding sessions by template
    await db.schema
      .createIndex("idx_gateway_template_sessions_template")
      .on("gateway_template_sessions")
      .column("template_id")
      .execute();

    // Index for finding sessions by external user within a template
    await db.schema
      .createIndex("idx_gateway_template_sessions_external_user")
      .on("gateway_template_sessions")
      .columns(["template_id", "external_user_id"])
      .execute();

    // Index for finding sessions by organization
    await db.schema
      .createIndex("idx_gateway_template_sessions_org")
      .on("gateway_template_sessions")
      .column("organization_id")
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    // Drop indexes first
    await db.schema
      .dropIndex("idx_gateway_template_sessions_org")
      .ifExists()
      .execute();
    await db.schema
      .dropIndex("idx_gateway_template_sessions_external_user")
      .ifExists()
      .execute();
    await db.schema
      .dropIndex("idx_gateway_template_sessions_template")
      .ifExists()
      .execute();
    await db.schema.dropIndex("idx_gateway_templates_org").ifExists().execute();

    // Drop tables (sessions first due to FK constraint)
    await db.schema.dropTable("gateway_template_sessions").ifExists().execute();
    await db.schema.dropTable("gateway_templates").ifExists().execute();
  },
};

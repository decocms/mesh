/**
 * Test Helpers for Storage Tests
 * Creates minimal schema for testing without full migrations
 */

import type { Kysely } from "kysely";
import type { Database } from "./types";

/**
 * Create minimal test schema for in-memory SQLite
 */
export async function createTestSchema(db: Kysely<Database>): Promise<void> {
  console.log("Creating test schema...");

  // Organization table (Better Auth managed, but needed for FK constraints)
  await db.schema
    .createTable("organization")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("slug", "text", (col) => col.notNull().unique())
    .addColumn("logo", "text")
    .addColumn("metadata", "text")
    .addColumn("createdAt", "text", (col) => col.notNull())
    .execute();

  // Users table - camelCase to match UserTable type
  await db.schema
    .createTable("users")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("email", "text", (col) => col.notNull().unique())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("role", "text", (col) => col.notNull().defaultTo("user"))
    .addColumn("createdAt", "text", (col) => col.notNull())
    .addColumn("updatedAt", "text", (col) => col.notNull())
    .execute();

  // Connections table (organization-scoped) - using snake_case to match actual schema
  await db.schema
    .createTable("connections")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("organization_id", "text", (col) => col.notNull())
    .addColumn("created_by", "text", (col) => col.notNull())
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("icon", "text")
    .addColumn("app_name", "text")
    .addColumn("app_id", "text")
    .addColumn("connection_type", "text", (col) => col.notNull())
    .addColumn("connection_url", "text", (col) => col.notNull())
    .addColumn("connection_token", "text")
    .addColumn("connection_headers", "text")
    .addColumn("oauth_config", "text")
    .addColumn("metadata", "text")
    .addColumn("tools", "text")
    .addColumn("bindings", "text")
    .addColumn("configuration_schema", "text")
    .addColumn("configuration_state", "text")
    .addColumn("configuration_scopes", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
    .addColumn("created_at", "text", (col) => col.notNull())
    .addColumn("updated_at", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("organization_settings")
    .ifNotExists()
    .addColumn("organizationId", "text", (col) => col.primaryKey())
    .addColumn("createdAt", "text", (col) => col.notNull())
    .addColumn("updatedAt", "text", (col) => col.notNull())
    .execute();

  // API Keys table - camelCase to match ApiKeyTable type
  await db.schema
    .createTable("api_keys")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("userId", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("hashedKey", "text", (col) => col.notNull().unique())
    .addColumn("permissions", "text", (col) => col.notNull())
    .addColumn("expiresAt", "text")
    .addColumn("remaining", "integer")
    .addColumn("metadata", "text")
    .addColumn("createdAt", "text", (col) => col.notNull())
    .addColumn("updatedAt", "text", (col) => col.notNull())
    .execute();

  // Audit Logs table - camelCase to match AuditLogTable type
  await db.schema
    .createTable("audit_logs")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("organizationId", "text")
    .addColumn("userId", "text")
    .addColumn("connectionId", "text")
    .addColumn("toolName", "text", (col) => col.notNull())
    .addColumn("allowed", "integer", (col) => col.notNull())
    .addColumn("duration", "integer")
    .addColumn("timestamp", "text", (col) => col.notNull())
    .addColumn("requestMetadata", "text")
    .execute();

  // Event Bus tables
  // Events table - stores CloudEvents
  await db.schema
    .createTable("events")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("organization_id", "text", (col) => col.notNull())
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("source", "text", (col) => col.notNull())
    .addColumn("specversion", "text", (col) => col.notNull().defaultTo("1.0"))
    .addColumn("subject", "text")
    .addColumn("time", "text", (col) => col.notNull())
    .addColumn("datacontenttype", "text", (col) =>
      col.notNull().defaultTo("application/json"),
    )
    .addColumn("dataschema", "text")
    .addColumn("data", "text")
    .addColumn("cron", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("attempts", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("last_error", "text")
    .addColumn("next_retry_at", "text")
    .addColumn("created_at", "text", (col) => col.notNull())
    .addColumn("updated_at", "text", (col) => col.notNull())
    .execute();

  // Event Subscriptions table
  await db.schema
    .createTable("event_subscriptions")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("organization_id", "text", (col) => col.notNull())
    // CASCADE DELETE: When connection is deleted, subscriptions are automatically removed
    .addColumn("connection_id", "text", (col) =>
      col.notNull().references("connections.id").onDelete("cascade"),
    )
    .addColumn("publisher", "text")
    .addColumn("event_type", "text", (col) => col.notNull())
    .addColumn("filter", "text")
    .addColumn("enabled", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("created_at", "text", (col) => col.notNull())
    .addColumn("updated_at", "text", (col) => col.notNull())
    .execute();

  // Event Deliveries table
  await db.schema
    .createTable("event_deliveries")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("event_id", "text", (col) => col.notNull())
    // CASCADE DELETE: When subscription is deleted, deliveries are automatically removed
    .addColumn("subscription_id", "text", (col) =>
      col.notNull().references("event_subscriptions.id").onDelete("cascade"),
    )
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("attempts", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("last_error", "text")
    .addColumn("delivered_at", "text")
    .addColumn("next_retry_at", "text")
    .addColumn("created_at", "text", (col) => col.notNull())
    .execute();
}

/**
 * Database Types for MCP Mesh
 *
 * These TypeScript interfaces define the database schema using Kysely's type-only approach.
 * The dialect (SQLite, PostgreSQL, MySQL) is determined at runtime from DATABASE_URL.
 *
 * Key Principles:
 * - Database = Organization boundary (all users are org members)
 * - Organizations managed by Better Auth organization plugin
 * - Connections are organization-scoped
 * - Access control via Better Auth permissions and organization roles
 */

import type { ColumnType } from "kysely";
import type { OAuthConfig, ToolDefinition } from "../tools/connection/schema";

// ============================================================================
// Type Utilities
// ============================================================================

/**
 * Helper for JSON columns that store arrays
 * Kysely maps JSON to string in database, but T[] in TypeScript
 */
export type JsonArray<T> = ColumnType<T[], string, string>;

/**
 * Helper for JSON columns that store objects
 * Kysely maps JSON to string in database, but T in TypeScript
 */
export type JsonObject<T> = ColumnType<T, string, string>;

// ============================================================================
// Permission Type (Better Auth format)
// ============================================================================

/**
 * Permission format used by Better Auth
 * Format: { [resource]: [actions...] }
 *
 * Examples:
 * - Organization-level: { "self": ["PROJECT_CREATE", "PROJECT_LIST"] }
 * - Connection-specific: { "conn_<UUID>": ["SEND_MESSAGE", "LIST_THREADS"] }
 */
export type Permission = Record<string, string[]>;

// ============================================================================
// Core Entity Interfaces
// ============================================================================

// ============================================================================
// Database Table Definitions (for Kysely schema)
// ============================================================================

/**
 * User table definition - System users
 * Managed by Better Auth, but defined here for reference
 */
export interface UserTable {
  id: string;
  email: string;
  name: string;
  role: string; // System role: 'admin' | 'user'
  createdAt: ColumnType<Date, Date | string, never>;
  updatedAt: ColumnType<Date, Date | string, Date | string>;
}

// ============================================================================
// Runtime Entity Types (for application code)
// ============================================================================

/**
 * User entity - Runtime representation
 */
export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Organization entity - Runtime representation (from Better Auth)
 * Better Auth organization plugin provides this data
 */
export interface Organization {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date | string;
}

export interface SidebarItem {
  title: string;
  url: string;
  connectionId: string;
  icon: string;
}

export interface OrganizationSettingsTable {
  organizationId: string;
  sidebar_items: JsonArray<SidebarItem[]> | null;
  createdAt: ColumnType<Date, Date | string, never>;
  updatedAt: ColumnType<Date, Date | string, Date | string>;
}

export interface OrganizationSettings {
  organizationId: string;
  sidebar_items: SidebarItem[] | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * MCP Connection table definition
 * Uses snake_case column names to align with ConnectionEntitySchema
 */
export interface MCPConnectionTable {
  id: string;
  organization_id: string; // All connections are organization-scoped
  created_by: string; // User who created this connection
  title: string;
  description: string | null;
  icon: string | null;
  app_name: string | null;
  app_id: string | null;

  // Connection details
  connection_type: "HTTP" | "SSE" | "Websocket";
  connection_url: string;
  connection_token: string | null; // Encrypted
  connection_headers: JsonObject<Record<string, string>> | null;

  // OAuth config for downstream MCP (if MCP supports OAuth)
  oauth_config: JsonObject<OAuthConfig> | null;

  // Configuration state (for MESH_CONFIGURATION feature)
  configuration_state: string | null; // Encrypted JSON state
  configuration_scopes: JsonArray<string[]> | null; // Array of scope strings

  // Metadata and discovery
  metadata: JsonObject<Record<string, unknown>> | null;
  tools: JsonArray<ToolDefinition[]> | null; // Discovered tools from MCP
  bindings: JsonArray<string[]> | null; // Detected bindings (CHAT, EMAIL, etc.)

  status: "active" | "inactive" | "error";
  created_at: ColumnType<Date, Date | string, never>;
  updated_at: ColumnType<Date, Date | string, Date | string>;
}

// MCPConnection runtime type is now ConnectionEntity from "../tools/connection/schema"
// OAuthConfig and ToolDefinition are also exported from schema.ts

/**
 * API Key table definition
 */
export interface ApiKeyTable {
  id: string;
  userId: string; // Owner of this API key
  name: string;
  hashedKey: string; // Hashed API key (Better Auth handles this)
  permissions: JsonObject<Permission>; // { [resource]: [actions...] }
  expiresAt: ColumnType<Date, Date | string, never> | null;
  remaining: number | null; // Request quota
  metadata: JsonObject<Record<string, unknown>> | null;
  createdAt: ColumnType<Date, Date | string, never>;
  updatedAt: ColumnType<Date, Date | string, Date | string>;
}

/**
 * Audit Log table definition
 */
export interface AuditLogTable {
  id: string;
  organizationId: string | null; // null = system-level action
  userId: string | null;
  connectionId: string | null;
  toolName: string; // Tool that was called
  allowed: number; // SQLite boolean (0 or 1)
  duration: number | null; // Execution time in ms
  timestamp: ColumnType<Date, Date | string, never>;
  requestMetadata: JsonObject<Record<string, unknown>> | null;
}

/**
 * API Key entity - Runtime representation
 */
export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  hashedKey: string;
  permissions: Permission;
  expiresAt: Date | string | null;
  remaining: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Audit Log entity - Runtime representation
 */
export interface AuditLog {
  id: string;
  organizationId: string | null;
  userId: string | null;
  connectionId: string | null;
  toolName: string;
  allowed: boolean;
  duration: number | null;
  timestamp: Date | string;
  requestMetadata: Record<string, unknown> | null;
}

// ============================================================================
// OAuth Table Definitions (for MCP OAuth server)
// ============================================================================

/**
 * OAuth Client table definition (RFC 7591 - Dynamic Client Registration)
 */
export interface OAuthClientTable {
  id: string;
  clientId: string; // Unique
  clientSecret: string | null; // Hashed, null for public clients
  clientName: string;
  redirectUris: JsonArray<string[]>; // JSON array
  grantTypes: JsonArray<string[]>; // JSON array
  scope: string | null;
  clientUri: string | null;
  logoUri: string | null;
  createdAt: ColumnType<Date, Date | string, never>;
}

/**
 * OAuth Authorization Code table definition (PKCE support)
 */
export interface OAuthAuthorizationCodeTable {
  code: string; // Primary key
  clientId: string; // Foreign key
  userId: string;
  redirectUri: string;
  scope: string | null;
  codeChallenge: string | null; // PKCE
  codeChallengeMethod: string | null; // 'S256'
  expiresAt: ColumnType<Date, Date | string, never>;
  createdAt: ColumnType<Date, Date | string, never>;
}

/**
 * OAuth Refresh Token table definition
 */
export interface OAuthRefreshTokenTable {
  token: string; // Primary key
  clientId: string; // Foreign key
  userId: string;
  scope: string | null;
  expiresAt: ColumnType<Date, Date | string, never> | null;
  createdAt: ColumnType<Date, Date | string, never>;
}

/**
 * Downstream Token table definition - Cache tokens from downstream MCPs
 */
export interface DownstreamTokenTable {
  id: string; // Primary key
  connectionId: string; // Foreign key
  userId: string | null; // Null for client_credentials tokens
  accessToken: string; // Encrypted
  refreshToken: string | null; // Encrypted
  scope: string | null;
  expiresAt: ColumnType<Date, Date | string, never> | null;
  createdAt: ColumnType<Date, Date | string, never>;
  updatedAt: ColumnType<Date, Date | string, Date | string>;
}

// ============================================================================
// OAuth Runtime Entity Types
// ============================================================================

/**
 * OAuth Client entity - Runtime representation
 */
export interface OAuthClient {
  id: string;
  clientId: string;
  clientSecret: string | null;
  clientName: string;
  redirectUris: string[];
  grantTypes: string[];
  scope: string | null;
  clientUri: string | null;
  logoUri: string | null;
  createdAt: Date | string;
}

/**
 * OAuth Authorization Code entity - Runtime representation
 */
export interface OAuthAuthorizationCode {
  code: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scope: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  expiresAt: Date | string;
  createdAt: Date | string;
}

/**
 * OAuth Refresh Token entity - Runtime representation
 */
export interface OAuthRefreshToken {
  token: string;
  clientId: string;
  userId: string;
  scope: string | null;
  expiresAt: Date | string | null;
  createdAt: Date | string;
}

/**
 * Downstream Token entity - Runtime representation
 */
export interface DownstreamToken {
  id: string;
  connectionId: string;
  userId: string | null;
  accessToken: string;
  refreshToken: string | null;
  scope: string | null;
  expiresAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// ============================================================================
// Database Schema
// ============================================================================

// ============================================================================
// Better Auth Organization Tables (managed by Better Auth plugin)
// ============================================================================

/**
 * Better Auth organization table
 */
export interface BetterAuthOrganizationTable {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  metadata: string | null;
  createdAt: ColumnType<Date, string, string>;
}

/**
 * Better Auth member table (organization membership)
 */
export interface BetterAuthMemberTable {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: ColumnType<Date, string, string>;
}

/**
 * Better Auth organization role table (custom roles)
 */
export interface BetterAuthOrganizationRoleTable {
  id: string;
  organizationId: string;
  role: string;
  permission: string; // JSON string
  createdAt: ColumnType<Date, string, string>;
}

/**
 * Monitoring Log table definition
 * Tracks all tool calls through the MCP proxy
 */
export interface MonitoringLogTable {
  id: string;
  organization_id: string;
  connection_id: string;
  connection_title: string;
  tool_name: string;
  input: JsonObject<Record<string, unknown>>; // Redacted JSON
  output: JsonObject<Record<string, unknown>>; // Redacted JSON
  is_error: number; // SQLite boolean (0 or 1)
  error_message: string | null;
  duration_ms: number;
  timestamp: ColumnType<Date, Date | string, never>;
  user_id: string | null;
  request_id: string;
}

/**
 * Monitoring Log runtime type
 */
export interface MonitoringLog {
  id?: string;
  organizationId: string;
  connectionId: string;
  connectionTitle: string;
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  isError: boolean;
  errorMessage?: string | null;
  durationMs: number;
  timestamp: Date | string;
  userId: string | null;
  requestId: string;
}

// ============================================================================
// Event Bus Table Definitions
// ============================================================================

/**
 * Event status for delivery tracking
 * - pending: Not yet processed
 * - processing: Claimed by a worker, delivery in progress
 * - delivered: Successfully delivered
 * - failed: Max retries reached, delivery failed
 */
export type EventStatus = "pending" | "processing" | "delivered" | "failed";

/**
 * Event table definition - Stores CloudEvents
 * Follows CloudEvents v1.0 specification
 */
export interface EventTable {
  id: string; // UUID
  organization_id: string;
  // CloudEvent required attributes
  type: string; // Event type (e.g., "order.created")
  source: string; // Connection ID of publisher
  specversion: string; // Always "1.0"
  // CloudEvent optional attributes
  subject: string | null; // Resource identifier
  time: string; // ISO 8601 timestamp
  datacontenttype: string; // Content type (default: "application/json")
  dataschema: string | null; // Schema URI
  data: JsonObject<unknown> | null; // JSON payload
  // Delivery tracking
  status: EventStatus;
  attempts: number;
  last_error: string | null;
  next_retry_at: string | null; // ISO 8601 timestamp for retry
  // Audit fields
  created_at: ColumnType<Date, Date | string, never>;
  updated_at: ColumnType<Date, Date | string, Date | string>;
}

/**
 * Event entity - Runtime representation
 */
export interface Event {
  id: string;
  organizationId: string;
  type: string;
  source: string;
  specversion: string;
  subject: string | null;
  time: string;
  datacontenttype: string;
  dataschema: string | null;
  data: unknown | null;
  status: EventStatus;
  attempts: number;
  lastError: string | null;
  nextRetryAt: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Event subscription table definition
 * Links subscriber connections to event type patterns
 */
export interface EventSubscriptionTable {
  id: string; // UUID
  organization_id: string;
  connection_id: string; // Subscriber connection (who receives events)
  publisher: string | null; // Filter by publisher connection (null = wildcard)
  event_type: string; // Event type pattern to match
  filter: string | null; // Optional JSONPath filter on event data
  enabled: number; // SQLite boolean (0 or 1)
  created_at: ColumnType<Date, Date | string, never>;
  updated_at: ColumnType<Date, Date | string, Date | string>;
}

/**
 * Event subscription entity - Runtime representation
 */
export interface EventSubscription {
  id: string;
  organizationId: string;
  connectionId: string;
  publisher: string | null;
  eventType: string;
  filter: string | null;
  enabled: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Event delivery table definition
 * Tracks per-subscription delivery status for each event
 */
export interface EventDeliveryTable {
  id: string; // UUID
  event_id: string;
  subscription_id: string;
  status: EventStatus;
  attempts: number;
  last_error: string | null;
  delivered_at: string | null; // ISO 8601 timestamp
  created_at: ColumnType<Date, Date | string, never>;
}

/**
 * Event delivery entity - Runtime representation
 */
export interface EventDelivery {
  id: string;
  eventId: string;
  subscriptionId: string;
  status: EventStatus;
  attempts: number;
  lastError: string | null;
  deliveredAt: string | null;
  createdAt: Date | string;
}

/**
 * Complete database schema
 * All tables exist within the organization scope (database boundary)
 *
 * NOTE: This uses *Table types with ColumnType for proper Kysely type mapping
 * NOTE: Organizations, teams, members, and roles are managed by Better Auth organization plugin
 */
export interface Database {
  // Core tables (all within organization scope)
  users: UserTable; // System users
  connections: MCPConnectionTable; // MCP connections (organization-scoped)
  organization_settings: OrganizationSettingsTable; // Organization-level configuration
  api_keys: ApiKeyTable; // Better Auth API keys
  audit_logs: AuditLogTable; // Audit trail
  monitoring_logs: MonitoringLogTable; // Tool call monitoring logs

  // OAuth tables (for MCP OAuth server)
  oauth_clients: OAuthClientTable;
  oauth_authorization_codes: OAuthAuthorizationCodeTable;
  oauth_refresh_tokens: OAuthRefreshTokenTable;
  downstream_tokens: DownstreamTokenTable;

  // Better Auth organization tables (managed by Better Auth plugin)
  organization: BetterAuthOrganizationTable;
  member: BetterAuthMemberTable;
  organizationRole: BetterAuthOrganizationRoleTable;

  // Event bus tables
  events: EventTable;
  event_subscriptions: EventSubscriptionTable;
  event_deliveries: EventDeliveryTable;
}

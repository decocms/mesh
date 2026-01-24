/**
 * User Sandbox Plugin - Storage Types
 *
 * Database table types and entity interfaces for the plugin.
 */

import type { ColumnType } from "kysely";

// ============================================================================
// Database Table Types
// ============================================================================

export interface UserSandboxTable {
  id: string;
  organization_id: string;
  title: string;
  description: ColumnType<string | null, string | null, string | null>;
  icon: ColumnType<string | null, string | null, string | null>;
  required_apps: string; // JSON array
  redirect_url: ColumnType<string | null, string | null, string | null>;
  webhook_url: ColumnType<string | null, string | null, string | null>;
  event_type: ColumnType<string, string, string>;
  agent_title_template: ColumnType<string, string, string>;
  agent_instructions: ColumnType<string | null, string | null, string | null>;
  tool_selection_mode: ColumnType<string, string, string>;
  status: ColumnType<string, string, string>;
  created_at: ColumnType<string, string, string>;
  updated_at: ColumnType<string, string, string>;
  created_by: ColumnType<string | null, string | null, string | null>;
}

export interface UserSandboxSessionTable {
  id: string;
  template_id: string;
  organization_id: string;
  external_user_id: string;
  status: ColumnType<string, string, string>;
  app_statuses: ColumnType<string, string, string>; // JSON object
  created_agent_id: ColumnType<string | null, string | null, string | null>;
  redirect_url: ColumnType<string | null, string | null, string | null>;
  created_at: ColumnType<string, string, string>;
  updated_at: ColumnType<string, string, string>;
  expires_at: string;
}

/**
 * Linking table for unique (template, external_user_id) → Virtual MCP mapping.
 * Enforces uniqueness at the database level to prevent race conditions.
 */
export interface UserSandboxAgentTable {
  id: string;
  user_sandbox_id: string;
  external_user_id: string;
  connection_id: string;
  created_at: ColumnType<string, string, string>;
}

// ============================================================================
// Entity Types (Application Layer)
// ============================================================================

/**
 * OAuth configuration for an app
 */
export interface OAuthConfig {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  clientId: string;
  scopes: string[];
  grantType: "authorization_code" | "client_credentials";
}

/**
 * HTTP connection parameters
 */
export interface HttpConnectionParameters {
  headers?: Record<string, string>;
}

/**
 * STDIO connection parameters
 */
export interface StdioConnectionParameters {
  command: string;
  args?: string[];
  cwd?: string;
  envVars?: Record<string, string>;
}

/**
 * Required app configuration for a template
 * Includes all data needed to provision a connection at runtime
 */
export interface RequiredApp {
  /** App name from registry (e.g., "@deco/gmail") */
  app_name: string;
  /** Display title for the app */
  title: string;
  /** Description of the app */
  description?: string | null;
  /** Icon URL for the app */
  icon?: string | null;
  /** Connection type */
  connection_type: "HTTP" | "SSE" | "Websocket" | "STDIO";
  /** Connection URL (for HTTP/SSE/Websocket) */
  connection_url?: string | null;
  /** Connection parameters */
  connection_headers?:
    | HttpConnectionParameters
    | StdioConnectionParameters
    | null;
  /** OAuth configuration (if required) */
  oauth_config?: OAuthConfig | null;
  /** Selected tools to expose (null = all) */
  selected_tools: string[] | null;
  /** Selected resources to expose (null = all) */
  selected_resources: string[] | null;
  /** Selected prompts to expose (null = all) */
  selected_prompts: string[] | null;
}

/**
 * User Sandbox entity
 */
export interface UserSandboxEntity {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  icon: string | null;
  /** Required apps from registry */
  required_apps: RequiredApp[];
  /** URL to redirect to after completion */
  redirect_url: string | null;
  /** Webhook URL to call on completion */
  webhook_url: string | null;
  /** Event type to emit on completion */
  event_type: string;
  /** Template for agent title (supports {{externalUserId}}) */
  agent_title_template: string;
  /** Instructions for the created agent */
  agent_instructions: string | null;
  /** Tool selection mode for the created agent */
  tool_selection_mode: "inclusion" | "exclusion";
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * Per-app configuration status in a session
 */
export interface AppStatus {
  /** Whether the app has been configured */
  configured: boolean;
  /** Connection ID if created */
  connection_id: string | null;
  /** Error message if configuration failed */
  error: string | null;
}

/**
 * User Sandbox Session entity
 */
export interface UserSandboxSessionEntity {
  id: string;
  template_id: string;
  organization_id: string;
  /** External user ID from the platform's system */
  external_user_id: string;
  status: "pending" | "in_progress" | "completed";
  /** Per-app configuration status */
  app_statuses: Record<string, AppStatus>;
  /** Created agent ID (set on completion) */
  created_agent_id: string | null;
  /** Snapshot of redirect_url from template */
  redirect_url: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

// ============================================================================
// Input Types for Storage Operations
// ============================================================================

export interface UserSandboxCreateInput {
  organization_id: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  required_apps: RequiredApp[];
  redirect_url?: string | null;
  webhook_url?: string | null;
  event_type?: string;
  agent_title_template?: string;
  agent_instructions?: string | null;
  tool_selection_mode?: "inclusion" | "exclusion";
  created_by?: string | null;
}

export interface UserSandboxUpdateInput {
  title?: string;
  description?: string | null;
  icon?: string | null;
  required_apps?: RequiredApp[];
  redirect_url?: string | null;
  webhook_url?: string | null;
  event_type?: string;
  agent_title_template?: string;
  agent_instructions?: string | null;
  tool_selection_mode?: "inclusion" | "exclusion";
  status?: "active" | "inactive";
}

export interface UserSandboxSessionCreateInput {
  template_id: string;
  organization_id: string;
  external_user_id: string;
  redirect_url?: string | null;
  expires_at: string;
  /** Virtual MCP ID - created at session creation time */
  created_agent_id?: string | null;
}

export interface UserSandboxSessionUpdateInput {
  status?: "pending" | "in_progress" | "completed";
  app_statuses?: Record<string, AppStatus>;
  created_agent_id?: string | null;
}

// ============================================================================
// Extended Database Type for Plugin
// ============================================================================

export interface UserSandboxDatabase {
  user_sandbox: UserSandboxTable;
  user_sandbox_sessions: UserSandboxSessionTable;
  user_sandbox_agents: UserSandboxAgentTable;
}

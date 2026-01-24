/**
 * User Sandbox Plugin - Tool Schemas
 *
 * Zod schemas for tool inputs and outputs.
 */

import { z } from "zod";

// ============================================================================
// Common Schemas
// ============================================================================

const OAuthConfigSchema = z.object({
  authorizationEndpoint: z
    .string()
    .describe("OAuth authorization endpoint URL"),
  tokenEndpoint: z.string().describe("OAuth token endpoint URL"),
  clientId: z.string().describe("OAuth client ID"),
  scopes: z.array(z.string()).describe("OAuth scopes to request"),
  grantType: z
    .enum(["authorization_code", "client_credentials"])
    .describe("OAuth grant type"),
});

const HttpConnectionParametersSchema = z.object({
  headers: z.record(z.string(), z.string()).optional().describe("HTTP headers"),
});

const StdioConnectionParametersSchema = z.object({
  command: z.string().describe("Command to run"),
  args: z.array(z.string()).optional().describe("Command arguments"),
  cwd: z.string().optional().describe("Working directory"),
  envVars: z
    .record(z.string(), z.string())
    .optional()
    .describe("Environment variables"),
});

const RequiredAppSchema = z.object({
  app_name: z.string().describe("App name from registry (e.g., '@deco/gmail')"),
  title: z.string().describe("Display title for the app"),
  description: z.string().nullable().optional().describe("App description"),
  icon: z.string().nullable().optional().describe("Icon URL"),
  connection_type: z
    .enum(["HTTP", "SSE", "Websocket", "STDIO"])
    .describe("Connection type"),
  connection_url: z.string().nullable().optional().describe("MCP server URL"),
  connection_headers: z
    .union([HttpConnectionParametersSchema, StdioConnectionParametersSchema])
    .nullable()
    .optional()
    .describe("Connection parameters"),
  oauth_config: OAuthConfigSchema.nullable()
    .optional()
    .describe("OAuth configuration if required"),
  selected_tools: z
    .array(z.string())
    .nullable()
    .optional()
    .describe("Selected tools to expose (null = all)"),
  selected_resources: z
    .array(z.string())
    .nullable()
    .optional()
    .describe("Selected resources to expose (null = all)"),
  selected_prompts: z
    .array(z.string())
    .nullable()
    .optional()
    .describe("Selected prompts to expose (null = all)"),
});

const AppStatusSchema = z.object({
  configured: z.boolean().describe("Whether the app has been configured"),
  connection_id: z.string().nullable().describe("Connection ID if created"),
  error: z
    .string()
    .nullable()
    .describe("Error message if configuration failed"),
});

export const UserSandboxEntitySchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  required_apps: z.array(RequiredAppSchema),
  redirect_url: z.string().nullable(),
  webhook_url: z.string().nullable(),
  event_type: z.string(),
  agent_title_template: z.string(),
  agent_instructions: z.string().nullable(),
  tool_selection_mode: z.enum(["inclusion", "exclusion"]),
  status: z.enum(["active", "inactive"]),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.string().nullable(),
});

const UserSandboxSessionEntitySchema = z.object({
  id: z.string(),
  template_id: z.string(),
  organization_id: z.string(),
  external_user_id: z.string(),
  status: z.enum(["pending", "in_progress", "completed"]),
  app_statuses: z.record(z.string(), AppStatusSchema),
  created_agent_id: z.string().nullable(),
  redirect_url: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  expires_at: z.string(),
});

// ============================================================================
// Tool Input/Output Schemas
// ============================================================================

/**
 * Simplified app input for template creation.
 * Only app_name is required - other details are fetched from registry.
 */
const RequiredAppInputSchema = z.object({
  app_name: z
    .string()
    .describe("App name from registry (e.g., '@deco/openrouter')"),
  selected_tools: z
    .array(z.string())
    .nullable()
    .optional()
    .describe("Selected tools to expose (null = all)"),
  selected_resources: z
    .array(z.string())
    .nullable()
    .optional()
    .describe("Selected resources to expose (null = all)"),
  selected_prompts: z
    .array(z.string())
    .nullable()
    .optional()
    .describe("Selected prompts to expose (null = all)"),
});

// CREATE
export const UserSandboxCreateInputSchema = z.object({
  title: z.string().describe("Title for the template"),
  description: z.string().optional().describe("Optional description"),
  icon: z.string().optional().describe("Optional icon URL"),
  registry_id: z
    .string()
    .describe("Connection ID of the registry to look up apps from"),
  required_apps: z
    .array(RequiredAppInputSchema)
    .describe(
      "Apps to include - only app_name required, details fetched from registry",
    ),
  redirect_url: z
    .string()
    .optional()
    .describe("URL to redirect to after completion"),
  webhook_url: z
    .string()
    .optional()
    .describe("Webhook URL to call on completion"),
  event_type: z
    .string()
    .optional()
    .describe("Event type to emit (default: integration.completed)"),
  agent_title_template: z
    .string()
    .optional()
    .describe("Template for agent title (supports {{externalUserId}})"),
  agent_instructions: z
    .string()
    .optional()
    .describe("Instructions for the created agent"),
  tool_selection_mode: z
    .enum(["inclusion", "exclusion"])
    .optional()
    .describe("Tool selection mode for the agent"),
});

// UPDATE
export const UserSandboxUpdateInputSchema = z.object({
  id: z.string().describe("Template ID to update"),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  registry_id: z
    .string()
    .optional()
    .describe(
      "Connection ID of the registry (required if updating required_apps)",
    ),
  required_apps: z
    .array(RequiredAppInputSchema)
    .optional()
    .describe("Updated apps (details will be fetched from registry)"),
  redirect_url: z.string().nullable().optional(),
  webhook_url: z.string().nullable().optional(),
  event_type: z.string().optional(),
  agent_title_template: z.string().optional(),
  agent_instructions: z.string().nullable().optional(),
  tool_selection_mode: z.enum(["inclusion", "exclusion"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

// GET
export const UserSandboxGetInputSchema = z.object({
  id: z.string().describe("Template ID"),
});

// LIST
export const UserSandboxListInputSchema = z.object({});

// DELETE
export const UserSandboxDeleteInputSchema = z.object({
  id: z.string().describe("Template ID to delete"),
});

// CREATE SESSION
export const UserSandboxCreateSessionInputSchema = z.object({
  templateId: z.string().describe("Template ID"),
  externalUserId: z.string().describe("External user ID from your platform"),
  expiresInSeconds: z
    .number()
    .optional()
    .describe("Session expiration in seconds (default: 7 days)"),
});

export const UserSandboxCreateSessionOutputSchema = z.object({
  sessionId: z.string().describe("Session ID"),
  url: z.string().describe("URL for the connect flow"),
  expiresAt: z.string().describe("Session expiration time"),
  agentId: z
    .string()
    .nullable()
    .optional()
    .describe("Virtual MCP ID for this user (unique per template + user)"),
  created: z
    .boolean()
    .describe(
      "Whether the agent was newly created (true) or already existed (false)",
    ),
});

// LIST SESSIONS
export const UserSandboxListSessionsInputSchema = z.object({
  templateId: z.string().optional().describe("Filter by template ID"),
});

export const UserSandboxListSessionsOutputSchema = z.object({
  sessions: z.array(UserSandboxSessionEntitySchema),
});

// LIST USER AGENTS
export const UserSandboxListUserAgentsInputSchema = z.object({
  externalUserId: z.string().describe("External user ID to find agents for"),
});

const AgentSummarySchema = z.object({
  id: z.string().describe("Agent (Virtual MCP) ID"),
  title: z.string(),
  external_user_id: z.string(),
  template_id: z.string().nullable(),
  created_at: z.string(),
});

export const UserSandboxListUserAgentsOutputSchema = z.object({
  agents: z.array(AgentSummarySchema),
});

// CLEAR USER SESSION
export const UserSandboxClearUserSessionInputSchema = z.object({
  externalUserId: z
    .string()
    .describe("External user ID whose session data should be cleared"),
});

export const UserSandboxClearUserSessionOutputSchema = z.object({
  success: z.boolean(),
  deletedAgents: z.number().describe("Number of agents (Virtual MCPs) deleted"),
  deletedConnections: z
    .number()
    .describe("Number of child connections deleted"),
  deletedSessions: z.number().describe("Number of sessions deleted"),
});

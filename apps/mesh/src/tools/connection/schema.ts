/**
 * Connection Entity Schema
 *
 * Single source of truth for connection types.
 * Uses snake_case field names matching the database schema directly.
 */

import { z } from "zod";

/**
 * OAuth configuration schema for downstream MCP
 */
const OAuthConfigSchema = z.object({
  authorizationEndpoint: z.string().url(),
  tokenEndpoint: z.string().url(),
  introspectionEndpoint: z.string().url().optional(),
  clientId: z.string(),
  clientSecret: z.string().optional(),
  scopes: z.array(z.string()),
  grantType: z.enum(["authorization_code", "client_credentials"]),
});

export type OAuthConfig = z.infer<typeof OAuthConfigSchema>;

/**
 * Tool definition schema from MCP discovery
 */
const ToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.record(z.unknown()).optional(),
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

/**
 * Connection entity schema - single source of truth.
 * Compliant with collections binding pattern.
 */
export const ConnectionEntitySchema = z.object({
  // Base collection entity fields
  id: z.string().describe("Unique identifier for the connection"),
  title: z.string().describe("Human-readable name for the connection"),
  created_at: z.string().describe("When the connection was created"),
  updated_at: z.string().describe("When the connection was last updated"),
  created_by: z.string().describe("User ID who created the connection"),
  updated_by: z
    .string()
    .optional()
    .describe("User ID who last updated the connection"),

  // Connection-specific fields
  organization_id: z
    .string()
    .describe("Organization ID this connection belongs to"),
  description: z.string().nullable().describe("Description of the connection"),
  icon: z.string().nullable().describe("Icon URL for the connection"),
  app_name: z.string().nullable().describe("Associated app name"),
  app_id: z.string().nullable().describe("Associated app ID"),

  connection_type: z
    .enum(["HTTP", "SSE", "Websocket"])
    .describe("Type of connection"),
  connection_url: z.string().describe("URL for the connection"),
  connection_token: z.string().nullable().describe("Authentication token"),
  connection_headers: z
    .record(z.string(), z.string())
    .nullable()
    .describe("Custom headers"),

  oauth_config: OAuthConfigSchema.nullable().describe("OAuth configuration"),

  // New configuration fields (snake_case)
  configuration_state: z
    .record(z.unknown())
    .nullable()
    .describe("Configuration state (decrypted)"),
  configuration_scopes: z
    .array(z.string())
    .nullable()
    .optional()
    .describe("Configuration scopes"),

  metadata: z
    .record(z.unknown())
    .nullable()
    .describe("Additional metadata (includes repository info)"),
  tools: z
    .array(ToolDefinitionSchema)
    .nullable()
    .describe("Discovered tools from MCP"),
  bindings: z.array(z.string()).nullable().describe("Detected bindings"),

  status: z.enum(["active", "inactive", "error"]).describe("Current status"),
});

/**
 * The connection entity type - use this everywhere instead of MCPConnection
 */
export type ConnectionEntity = z.infer<typeof ConnectionEntitySchema>;

/**
 * Input schema for creating connections
 */
export const ConnectionCreateDataSchema = ConnectionEntitySchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
  created_by: true,
  updated_by: true,
  organization_id: true,
  tools: true,
  bindings: true,
  status: true,
}).partial({
  description: true,
  icon: true,
  app_name: true,
  app_id: true,
  connection_token: true,
  connection_headers: true,
  oauth_config: true,
  configuration_state: true,
  configuration_scopes: true,
  metadata: true,
});

export type ConnectionCreateData = z.infer<typeof ConnectionCreateDataSchema>;

/**
 * Input schema for updating connections
 */
export const ConnectionUpdateDataSchema = ConnectionEntitySchema.partial();

export type ConnectionUpdateData = z.infer<typeof ConnectionUpdateDataSchema>;

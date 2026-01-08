/**
 * Factory functions for creating demo seed records
 */

/**
 * Generate a unique ID with prefix
 */
export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a user record
 */
export function createUserRecord(
  userId: string,
  email: string,
  name: string,
  role: string,
  timestamp: string,
) {
  return {
    id: userId,
    email,
    emailVerified: 1,
    name,
    image: null,
    role,
    banned: null,
    banReason: null,
    banExpires: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Create an account record for credential authentication
 */
export function createAccountRecord(
  userId: string,
  email: string,
  passwordHash: string,
  timestamp: string,
) {
  return {
    id: generateId("account"),
    userId,
    accountId: email,
    providerId: "credential",
    password: passwordHash,
    accessToken: null,
    refreshToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
    scope: null,
    idToken: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Create a member record linking user to organization
 */
export function createMemberRecord(
  organizationId: string,
  userId: string,
  role: "owner" | "member",
  timestamp: string,
) {
  return {
    id: generateId("member"),
    organizationId,
    userId,
    role,
    createdAt: timestamp,
  };
}

/**
 * Create an API key record
 */
export function createApiKeyRecord(
  userId: string,
  name: string,
  key: string,
  timestamp: string,
) {
  return {
    id: generateId("apikey"),
    name,
    userId,
    key,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Create a connection record
 */
export function createConnectionRecord(
  connectionId: string,
  organizationId: string,
  createdBy: string,
  title: string,
  description: string,
  icon: string,
  appName: string,
  connectionUrl: string,
  connectionToken: string | null,
  configurationState: "needs_auth" | null,
  metadata: Record<string, unknown>,
  timestamp: string,
) {
  return {
    id: connectionId,
    organization_id: organizationId,
    created_by: createdBy,
    title,
    description,
    icon,
    app_name: appName,
    app_id: null,
    connection_type: "HTTP" as const,
    connection_url: connectionUrl,
    connection_token: connectionToken,
    connection_headers: null,
    oauth_config: null,
    configuration_state: configurationState,
    configuration_scopes: null,
    metadata: JSON.stringify(metadata),
    tools: null,
    bindings: null,
    status: "active" as const,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

/**
 * Create a gateway record
 */
export function createGatewayRecord(
  gatewayId: string,
  organizationId: string,
  title: string,
  description: string,
  toolSelectionStrategy: "passthrough" | "code_execution",
  toolSelectionMode: "inclusion" | "exclusion",
  icon: string | null,
  isDefault: boolean,
  createdBy: string,
  timestamp: string,
) {
  return {
    id: gatewayId,
    organization_id: organizationId,
    title,
    description,
    tool_selection_strategy: toolSelectionStrategy,
    tool_selection_mode: toolSelectionMode,
    icon,
    status: "active" as const,
    is_default: isDefault ? 1 : 0,
    created_at: timestamp,
    updated_at: timestamp,
    created_by: createdBy,
    updated_by: null,
  };
}

/**
 * Create a gateway-connection link record
 */
export function createGatewayConnectionRecord(
  gatewayId: string,
  connectionId: string,
  timestamp: string,
) {
  return {
    id: generateId("gtw_conn"),
    gateway_id: gatewayId,
    connection_id: connectionId,
    selected_tools: null,
    selected_resources: null,
    selected_prompts: null,
    created_at: timestamp,
  };
}

/**
 * Create a monitoring log record
 */
export function createMonitoringLogRecord(
  organizationId: string,
  connectionId: string,
  connectionTitle: string,
  toolName: string,
  input: unknown,
  output: unknown,
  isError: boolean,
  errorMessage: string | null,
  durationMs: number,
  timestamp: string,
  userId: string,
  userAgent: string,
  gatewayId: string | null,
  properties: Record<string, string> | null,
) {
  return {
    id: generateId("log"),
    organization_id: organizationId,
    connection_id: connectionId,
    connection_title: connectionTitle,
    tool_name: toolName,
    input: JSON.stringify(input),
    output: JSON.stringify(output),
    is_error: isError ? 1 : 0,
    error_message: errorMessage,
    duration_ms: durationMs,
    timestamp,
    user_id: userId,
    request_id: generateId("req"),
    user_agent: userAgent,
    gateway_id: gatewayId,
    properties: properties ? JSON.stringify(properties) : null,
  };
}

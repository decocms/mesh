/**
 * Tool Registry
 *
 * Metadata for all management tools, used for:
 * - OAuth consent UI (displaying available permissions)
 * - API documentation
 * - Tool discovery
 * - Role permission selection
 *
 * NOTE: This file is imported by frontend code. Do NOT import runtime values
 * from ./index (only type imports are safe, but they cause circular issues).
 *
 * Keep ALL_TOOL_NAMES in sync with ALL_TOOLS in index.ts manually.
 * A test can verify they match.
 */

// ============================================================================
// Types
// ============================================================================

export type ToolCategory =
  | "Organizations"
  | "Connections"
  | "Gateways"
  | "Monitoring"
  | "Users"
  | "API Keys"
  | "Event Bus"
  | "Code Execution";

/**
 * All tool names - keep in sync with ALL_TOOLS in index.ts
 */
const ALL_TOOL_NAMES = [
  // Organization tools
  "ORGANIZATION_CREATE",
  "ORGANIZATION_LIST",
  "ORGANIZATION_GET",
  "ORGANIZATION_UPDATE",
  "ORGANIZATION_DELETE",
  "ORGANIZATION_SETTINGS_GET",
  "ORGANIZATION_SETTINGS_UPDATE",
  "ORGANIZATION_MEMBER_ADD",
  "ORGANIZATION_MEMBER_REMOVE",
  "ORGANIZATION_MEMBER_LIST",
  "ORGANIZATION_MEMBER_UPDATE_ROLE",
  // Connection tools
  "COLLECTION_CONNECTIONS_CREATE",
  "COLLECTION_CONNECTIONS_LIST",
  "COLLECTION_CONNECTIONS_GET",
  "COLLECTION_CONNECTIONS_UPDATE",
  "COLLECTION_CONNECTIONS_DELETE",
  "CONNECTION_TEST",
  // Gateway tools
  "COLLECTION_GATEWAY_CREATE",
  "COLLECTION_GATEWAY_LIST",
  "COLLECTION_GATEWAY_GET",
  "COLLECTION_GATEWAY_UPDATE",
  "COLLECTION_GATEWAY_DELETE",
  // Database tools
  "DATABASES_RUN_SQL",
  // Monitoring tools
  "MONITORING_LOGS_LIST",
  "MONITORING_STATS",
  // API Key tools
  "API_KEY_CREATE",
  "API_KEY_LIST",
  "API_KEY_UPDATE",
  "API_KEY_DELETE",
  // Event Bus tools
  "EVENT_PUBLISH",
  "EVENT_SUBSCRIBE",
  "EVENT_UNSUBSCRIBE",
  "EVENT_CANCEL",
  "EVENT_ACK",
  "EVENT_SUBSCRIPTION_LIST",
  "EVENT_SYNC_SUBSCRIPTIONS",
  // User tools
  "USER_GET",
  // Code Execution tools
  "CODE_EXECUTION_SEARCH_TOOLS",
  "CODE_EXECUTION_DESCRIBE_TOOLS",
  "CODE_EXECUTION_RUN_CODE",
] as const;

/**
 * ToolName type derived from ALL_TOOL_NAMES
 */
export type ToolName = (typeof ALL_TOOL_NAMES)[number];

export interface ToolMetadata {
  name: ToolName;
  description: string;
  category: ToolCategory;
  dangerous?: boolean; // Requires extra confirmation
}

/**
 * Permission option for UI components
 */
export interface PermissionOption {
  value: ToolName;
  label: string;
  dangerous?: boolean;
}

/**
 * Grouped permissions by category for UI
 */
export interface PermissionGroup {
  category: ToolCategory;
  label: string;
  permissions: PermissionOption[];
}

// ============================================================================
// Tool Metadata (static - no server imports)
// ============================================================================

/**
 * All management tools with metadata
 * Defined statically to avoid importing server-side tool implementations
 */
export const MANAGEMENT_TOOLS: ToolMetadata[] = [
  // Organization tools
  {
    name: "ORGANIZATION_CREATE",
    description: "Create a new organization",
    category: "Organizations",
  },
  {
    name: "ORGANIZATION_LIST",
    description: "List organizations",
    category: "Organizations",
  },
  {
    name: "ORGANIZATION_GET",
    description: "View organization details",
    category: "Organizations",
  },
  {
    name: "ORGANIZATION_UPDATE",
    description: "Update organization",
    category: "Organizations",
  },
  {
    name: "ORGANIZATION_DELETE",
    description: "Delete organization",
    category: "Organizations",
    dangerous: true,
  },
  {
    name: "ORGANIZATION_SETTINGS_GET",
    description: "View organization settings",
    category: "Organizations",
  },
  {
    name: "ORGANIZATION_SETTINGS_UPDATE",
    description: "Update organization settings",
    category: "Organizations",
  },
  {
    name: "ORGANIZATION_MEMBER_ADD",
    description: "Add members",
    category: "Organizations",
  },
  {
    name: "ORGANIZATION_MEMBER_REMOVE",
    description: "Remove members",
    category: "Organizations",
    dangerous: true,
  },
  {
    name: "ORGANIZATION_MEMBER_LIST",
    description: "List members",
    category: "Organizations",
  },
  {
    name: "ORGANIZATION_MEMBER_UPDATE_ROLE",
    description: "Update member roles",
    category: "Organizations",
  },
  // Connection tools
  {
    name: "COLLECTION_CONNECTIONS_CREATE",
    description: "Create connections",
    category: "Connections",
  },
  {
    name: "COLLECTION_CONNECTIONS_LIST",
    description: "List connections",
    category: "Connections",
  },
  {
    name: "COLLECTION_CONNECTIONS_GET",
    description: "View connection details",
    category: "Connections",
  },
  {
    name: "COLLECTION_CONNECTIONS_UPDATE",
    description: "Update connections",
    category: "Connections",
  },
  {
    name: "COLLECTION_CONNECTIONS_DELETE",
    description: "Delete connections",
    category: "Connections",
    dangerous: true,
  },
  {
    name: "CONNECTION_TEST",
    description: "Test connections",
    category: "Connections",
  },
  {
    name: "DATABASES_RUN_SQL",
    description: "Run SQL queries",
    category: "Connections",
    dangerous: true,
  },
  // Gateway tools
  {
    name: "COLLECTION_GATEWAY_CREATE",
    description: "Create gateways",
    category: "Gateways",
  },
  {
    name: "COLLECTION_GATEWAY_LIST",
    description: "List gateways",
    category: "Gateways",
  },
  {
    name: "COLLECTION_GATEWAY_GET",
    description: "View gateway details",
    category: "Gateways",
  },
  {
    name: "COLLECTION_GATEWAY_UPDATE",
    description: "Update gateways",
    category: "Gateways",
  },
  {
    name: "COLLECTION_GATEWAY_DELETE",
    description: "Delete gateways",
    category: "Gateways",
    dangerous: true,
  },
  // Monitoring tools
  {
    name: "MONITORING_LOGS_LIST",
    description: "List monitoring logs",
    category: "Monitoring",
  },
  {
    name: "MONITORING_STATS",
    description: "View monitoring statistics",
    category: "Monitoring",
  },
  {
    name: "API_KEY_CREATE",
    description: "Create API key",
    category: "API Keys",
  },
  {
    name: "API_KEY_LIST",
    description: "List API keys",
    category: "API Keys",
  },
  {
    name: "API_KEY_UPDATE",
    description: "Update API key",
    category: "API Keys",
  },
  {
    name: "API_KEY_DELETE",
    description: "Delete API key",
    category: "API Keys",
    dangerous: true,
  },
  // Event Bus tools
  {
    name: "EVENT_PUBLISH",
    description: "Publish events",
    category: "Event Bus",
  },
  {
    name: "EVENT_SUBSCRIBE",
    description: "Subscribe to events",
    category: "Event Bus",
  },
  {
    name: "EVENT_UNSUBSCRIBE",
    description: "Unsubscribe from events",
    category: "Event Bus",
  },
  {
    name: "EVENT_CANCEL",
    description: "Cancel recurring events",
    category: "Event Bus",
  },
  {
    name: "EVENT_ACK",
    description: "Acknowledge event delivery",
    category: "Event Bus",
  },
  {
    name: "EVENT_SUBSCRIPTION_LIST",
    description: "List event subscriptions",
    category: "Event Bus",
  },
  {
    name: "EVENT_SYNC_SUBSCRIPTIONS",
    description: "Sync subscriptions to desired state",
    category: "Event Bus",
  },
  // User tools
  {
    name: "USER_GET",
    description: "Get a user by id",
    category: "Users",
  },
  // Code Execution tools
  {
    name: "CODE_EXECUTION_SEARCH_TOOLS",
    description: "Search available tools by name or description",
    category: "Code Execution",
  },
  {
    name: "CODE_EXECUTION_DESCRIBE_TOOLS",
    description: "Get detailed schemas for specific tools",
    category: "Code Execution",
  },
  {
    name: "CODE_EXECUTION_RUN_CODE",
    description: "Run JavaScript code in a sandbox with tool access",
    category: "Code Execution",
    dangerous: true,
  },
];

/**
 * Human-readable labels for tool names
 */
const TOOL_LABELS: Record<ToolName, string> = {
  ORGANIZATION_CREATE: "Create organization",
  ORGANIZATION_LIST: "List organizations",
  ORGANIZATION_GET: "View organization details",
  ORGANIZATION_UPDATE: "Update organization",
  ORGANIZATION_DELETE: "Delete organization",
  ORGANIZATION_SETTINGS_GET: "View organization settings",
  ORGANIZATION_SETTINGS_UPDATE: "Update organization settings",
  ORGANIZATION_MEMBER_LIST: "List members",
  ORGANIZATION_MEMBER_ADD: "Add members",
  ORGANIZATION_MEMBER_REMOVE: "Remove members",
  ORGANIZATION_MEMBER_UPDATE_ROLE: "Update member roles",
  COLLECTION_CONNECTIONS_LIST: "List connections",
  COLLECTION_CONNECTIONS_GET: "View connection details",
  COLLECTION_CONNECTIONS_CREATE: "Create connections",
  COLLECTION_CONNECTIONS_UPDATE: "Update connections",
  COLLECTION_CONNECTIONS_DELETE: "Delete connections",
  CONNECTION_TEST: "Test connections",
  DATABASES_RUN_SQL: "Run SQL queries",
  COLLECTION_GATEWAY_CREATE: "Create gateways",
  COLLECTION_GATEWAY_LIST: "List gateways",
  COLLECTION_GATEWAY_GET: "View gateway details",
  COLLECTION_GATEWAY_UPDATE: "Update gateways",
  COLLECTION_GATEWAY_DELETE: "Delete gateways",
  MONITORING_LOGS_LIST: "List monitoring logs",
  MONITORING_STATS: "View monitoring statistics",
  API_KEY_CREATE: "Create API key",
  API_KEY_LIST: "List API keys",
  API_KEY_UPDATE: "Update API key",
  API_KEY_DELETE: "Delete API key",
  EVENT_PUBLISH: "Publish events",
  EVENT_SUBSCRIBE: "Subscribe to events",
  EVENT_UNSUBSCRIBE: "Unsubscribe from events",
  EVENT_CANCEL: "Cancel recurring events",
  EVENT_ACK: "Acknowledge event delivery",
  EVENT_SUBSCRIPTION_LIST: "List event subscriptions",
  EVENT_SYNC_SUBSCRIPTIONS: "Sync subscriptions to desired state",

  USER_GET: "Get user by id",
  CODE_EXECUTION_SEARCH_TOOLS: "Search tools",
  CODE_EXECUTION_DESCRIBE_TOOLS: "Describe tools",
  CODE_EXECUTION_RUN_CODE: "Run code",
};

// ============================================================================
// Exports
// ============================================================================

/**
 * Get tools grouped by category
 */
export function getToolsByCategory() {
  const grouped: Record<string, ToolMetadata[]> = {
    Organizations: [],
    Connections: [],
    Gateways: [],
    Monitoring: [],
    Users: [],
    "API Keys": [],
    "Event Bus": [],
    "Code Execution": [],
  };

  for (const tool of MANAGEMENT_TOOLS) {
    grouped[tool.category]?.push(tool);
  }

  return grouped;
}

/**
 * Get permission options for UI components (type-safe)
 * Returns flat array of all static permissions with labels
 */
export function getPermissionOptions(): PermissionOption[] {
  return MANAGEMENT_TOOLS.map((tool) => ({
    value: tool.name,
    label: TOOL_LABELS[tool.name],
    dangerous: tool.dangerous,
  }));
}

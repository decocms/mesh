/**
 * Centralized Query Keys for React Query
 *
 * This ensures consistent cache key management across the application
 * and prevents inline array declarations that are harder to maintain.
 */

import { ProjectLocator } from "./locator";

export const KEYS = {
  // Public config (no auth required)
  publicConfig: () => ["publicConfig"] as const,

  // Auth-related queries
  authConfig: () => ["authConfig"] as const,
  session: () => ["session"] as const,

  // Chat store (IndexedDB) queries
  threads: (locator: string) => ["threads", locator] as const,
  virtualMcpThreads: (locator: string, virtualMcpId: string) =>
    ["threads", locator, "virtual-mcp", virtualMcpId] as const,
  thread: (locator: string, threadId: string) =>
    ["thread", locator, threadId] as const,
  threadMessages: (locator: string, threadId: string) =>
    ["thread-messages", locator, threadId] as const,
  messages: (locator: string) => ["messages", locator] as const,

  // Organizations list
  organizations: () => ["organizations"] as const,

  // Organization members (scoped by org)
  members: (locator: ProjectLocator) => [locator, "members"] as const,

  // Organization invitations (scoped by org)
  invitations: (locator: ProjectLocator) => [locator, "invitations"] as const,

  // Organization roles (scoped by org)
  organizationRoles: (locator: ProjectLocator) =>
    [locator, "organization-roles"] as const,

  // Connections (scoped by project)
  connections: (locator: ProjectLocator) => [locator, "connections"] as const,
  connectionsByBinding: (locator: ProjectLocator, binding: string) =>
    [locator, "connections", `binding:${binding}`] as const,
  connection: (locator: ProjectLocator, id: string) =>
    [locator, "connection", id] as const,

  isMCPAuthenticated: (url: string, token: string | null) =>
    ["is-mcp-authenticated", url, token] as const,

  // MCP tools (scoped by URL and optional token)
  mcpTools: (url: string, token?: string | null) =>
    ["mcp", "tools", url, token] as const,

  organizationSettings: (organizationId: string) =>
    ["organization-settings", organizationId] as const,

  // Active organization
  activeOrganization: (org: string | undefined) =>
    ["activeOrganization", org] as const,

  // Models list (scoped by organization)
  modelsList: (orgSlug: string) => ["models-list", orgSlug] as const,

  // Collections (scoped by connection)
  connectionCollections: (connectionId: string) =>
    [connectionId, "collections", "discovery"] as const,

  // Tool call results (generic caching for MCP tool calls)
  // scope is required - scopes the cache (connectionId for connection-scoped, locator for org/project-scoped)
  toolCall: (scope: string, toolName: string, paramsKey: string) =>
    ["tool-call", scope, toolName, paramsKey] as const,

  // Collection items (scoped by connection and collection name)
  collectionItems: (connectionId: string, collectionName: string) =>
    ["collection", connectionId, collectionName] as const,

  // Collection CRUD queries (scoped by org, scopeKey and collection name)
  // org: organization slug
  // scopeKey: connectionId for connection-scoped tools, gatewayId for gateway-scoped, etc.
  // Base prefix for invalidating all collection variants
  collection: (org: string, scopeKey: string, collectionName: string) =>
    [org, scopeKey, "collection", collectionName] as const,
  // Item query
  collectionItem: (
    org: string,
    scopeKey: string,
    collectionName: string,
    itemId: string,
  ) => [org, scopeKey, "collection", collectionName, itemId] as const,
  // List query
  collectionList: (
    org: string,
    scopeKey: string,
    collectionName: string,
    paramsKey: string,
  ) =>
    [org, scopeKey, "collection", collectionName, "list", paramsKey] as const,
  // Infinite list query
  collectionListInfinite: (
    org: string,
    scopeKey: string,
    collectionName: string,
    paramsKey: string,
  ) =>
    [
      org,
      scopeKey,
      "collection",
      collectionName,
      "list-infinite",
      paramsKey,
    ] as const,

  // GitHub README (scoped by owner and repo)
  githubReadme: (
    owner: string | null | undefined,
    repo: string | null | undefined,
  ) => ["github-readme", owner, repo] as const,

  // Monitoring queries
  monitoringStats: () => ["monitoring", "stats"] as const,
  monitoringLogs: (filters: {
    connectionId?: string;
    toolName?: string;
    isError?: boolean;
    limit?: number;
    offset?: number;
  }) => ["monitoring", "logs", filters] as const,
  monitoringLogsInfinite: (locator: string, paramsKey: string) =>
    ["monitoring", "logs-infinite", locator, paramsKey] as const,

  // Virtual MCP prompts (for ice breakers in chat)
  // null virtualMcpId means default virtual MCP
  virtualMcpPrompts: (virtualMcpId: string | null, orgSlug: string) =>
    ["virtual-mcp", orgSlug, virtualMcpId ?? "default", "prompts"] as const,

  // Virtual MCP resources (for resource mentions in chat)
  // null virtualMcpId means default virtual MCP
  virtualMcpResources: (virtualMcpId: string | null, orgSlug: string) =>
    ["virtual-mcp", orgSlug, virtualMcpId ?? "default", "resources"] as const,

  // Suggestion menu items (for filtering prompts/resources in chat input)
  // Note: The hook appends `show` and `query` to this base key
  suggestionItems: (
    baseKey: readonly unknown[],
    isOpen: boolean,
    query: string,
  ) => [...baseKey, isOpen, query] as const,

  // Connection prompts (for gateway settings)
  connectionPrompts: (connectionId: string) =>
    ["connection", connectionId, "prompts"] as const,

  // Connection resources (for gateway settings)
  connectionResources: (connectionId: string) =>
    ["connection", connectionId, "resources"] as const,

  // User data
  user: (userId: string) => ["user", userId] as const,
} as const;

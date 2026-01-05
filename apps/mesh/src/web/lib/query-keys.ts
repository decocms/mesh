/**
 * Centralized Query Keys for React Query
 *
 * This ensures consistent cache key management across the application
 * and prevents inline array declarations that are harder to maintain.
 */

import { ProjectLocator } from "./locator";

export const KEYS = {
  // Auth-related queries
  authConfig: () => ["authConfig"] as const,

  // Chat store (IndexedDB) queries
  threads: (locator: string) => ["threads", locator] as const,
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

  // Folders (scoped by org and type)
  folders: (orgSlug: string, type: "connections" | "gateways") =>
    ["folders", orgSlug, type] as const,

  // Generic collection key (for invalidation)
  collection: (orgSlug: string, collectionName: string) =>
    ["collection-list", orgSlug, collectionName] as const,

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

  // Collection CRUD queries (scoped by scopeKey and collection name)
  // scopeKey is connectionId for connection-scoped tools, org.slug for mesh-scoped collections
  collectionItem: (scopeKey: string, collectionName: string, itemId: string) =>
    ["collection-item", scopeKey, collectionName, itemId] as const,
  // Prefix keys (used for invalidating all variants regardless of paramsKey)
  collectionListPrefix: (scopeKey: string, collectionName: string) =>
    ["collection-list", scopeKey, collectionName] as const,
  collectionList: (
    scopeKey: string,
    collectionName: string,
    paramsKey: string,
  ) => ["collection-list", scopeKey, collectionName, paramsKey] as const,
  // Prefix keys (used for invalidating all variants regardless of paramsKey)
  collectionListInfinitePrefix: (scopeKey: string, collectionName: string) =>
    ["collection-list-infinite", scopeKey, collectionName] as const,
  collectionListInfinite: (
    scopeKey: string,
    collectionName: string,
    paramsKey: string,
  ) =>
    ["collection-list-infinite", scopeKey, collectionName, paramsKey] as const,

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

  // Gateway prompts (for ice breakers in chat)
  gatewayPrompts: (gatewayId: string) =>
    ["gateway", gatewayId, "prompts"] as const,

  // Connection prompts (for gateway settings)
  connectionPrompts: (connectionId: string) =>
    ["connection", connectionId, "prompts"] as const,

  // Connection resources (for gateway settings)
  connectionResources: (connectionId: string) =>
    ["connection", connectionId, "resources"] as const,
} as const;

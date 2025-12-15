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

  // Organizations list
  organizations: () => ["organizations"] as const,

  // Organization members (scoped by org)
  members: (locator: ProjectLocator) => [locator, "members"] as const,

  // Organization roles (scoped by org)
  organizationRoles: (locator: ProjectLocator) =>
    [locator, "organization-roles"] as const,

  // Connections (scoped by project)
  connections: (locator: ProjectLocator) => [locator, "connections"] as const,
  connectionsByBinding: (locator: ProjectLocator, binding: string) =>
    [locator, "connections", `binding:${binding}`] as const,
  connection: (locator: ProjectLocator, id: string) =>
    [locator, "connection", id] as const,

  organizationSettings: (organizationId: string) =>
    ["organization-settings", organizationId] as const,

  // Active organization
  activeOrganization: (org: string | undefined) =>
    ["activeOrganization", org] as const,

  // Models list (scoped by organization)
  modelsList: (orgSlug: string) => ["models-list", orgSlug] as const,

  // Sidebar items (scoped by project)
  sidebarItems: (locator: ProjectLocator) =>
    [locator, "sidebar-items"] as const,

  // Collections (scoped by connection)
  connectionCollections: (connectionId: string) =>
    [connectionId, "collections", "discovery"] as const,

  // Tool call results (generic caching for MCP tool calls)
  // connectionId is optional - if provided, scopes the cache to that connection
  toolCall: (toolName: string, paramsKey: string, connectionId?: string) =>
    connectionId
      ? (["tool-call", connectionId, toolName, paramsKey] as const)
      : (["tool-call", toolName, paramsKey] as const),

  // Collection items (scoped by connection and collection name)
  collectionItems: (connectionId: string, collectionName: string) =>
    ["collection", connectionId, collectionName] as const,

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
} as const;

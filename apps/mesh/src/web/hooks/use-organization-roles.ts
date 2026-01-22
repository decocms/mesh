/**
 * Organization Roles Hook
 *
 * Provides React hooks for working with organization roles using Better Auth's
 * dynamic access control feature. Combines built-in roles with custom roles.
 */

import { WellKnownMCPId } from "@/core/well-known-mcp";
import { authClient } from "@/web/lib/auth-client";
import { KEYS } from "@/web/lib/query-keys";
import { useProjectContext } from "@decocms/mesh-sdk";
import { useQuery } from "@tanstack/react-query";

const BUILTIN_ROLES = [
  { value: "owner", label: "Owner", isBuiltin: true },
  { value: "admin", label: "Admin", isBuiltin: true },
  { value: "user", label: "User", isBuiltin: true },
] as const;

function formatRoleLabel(role: string): string {
  return role.replace(/-/g, " ");
}

export interface OrganizationRole {
  id?: string;
  role: string;
  label: string;
  isBuiltin: boolean;
  permission?: Record<string, string[]>;
  // Static/organization-level permissions (under "self")
  staticPermissionCount?: number;
  allowsAllStaticPermissions?: boolean;
  // Connection-specific permissions
  connectionCount?: number;
  toolCount?: number;
  allowsAllConnections?: boolean;
  allowsAllTools?: boolean;
}

/**
 * Parse permission to extract static and connection-specific information
 * Format: { "self": ["PERM1", "PERM2"], "<connectionId>": ["tool1", "tool2"], "*": ["*"] }
 */
function parsePermission(
  permission: Record<string, string[]> | undefined | null,
): {
  // Static permissions (under "self")
  staticPermissions: string[];
  allowsAllStaticPermissions: boolean;
  // Connection permissions
  connectionIds: string[];
  allowsAllConnections: boolean;
  toolNames: string[];
  allowsAllTools: boolean;
} {
  if (!permission) {
    return {
      staticPermissions: [],
      allowsAllStaticPermissions: false,
      connectionIds: [],
      allowsAllConnections: false,
      toolNames: [],
      allowsAllTools: false,
    };
  }

  const staticPermissions: string[] = [];
  let allowsAllStaticPermissions = false;
  const connectionIds: string[] = [];
  let allowsAllConnections = false;
  const toolNamesSet = new Set<string>();
  let allowsAllTools = false;

  for (const [resource, tools] of Object.entries(permission)) {
    // "self" is for static/organization-level permissions
    if (resource === WellKnownMCPId.SELF) {
      if (tools.includes("*")) {
        allowsAllStaticPermissions = true;
      } else {
        staticPermissions.push(...tools);
      }
      continue;
    }

    // "*" is for all connections
    if (resource === "*") {
      allowsAllConnections = true;
      // Check tools for this wildcard
      if (tools.includes("*")) {
        allowsAllTools = true;
      } else {
        for (const tool of tools) {
          toolNamesSet.add(tool);
        }
      }
      continue;
    }

    // Otherwise it's a connection ID
    connectionIds.push(resource);

    // Check tools
    if (tools.includes("*")) {
      allowsAllTools = true;
    } else {
      for (const tool of tools) {
        toolNamesSet.add(tool);
      }
    }
  }

  return {
    staticPermissions,
    allowsAllStaticPermissions,
    connectionIds,
    allowsAllConnections,
    toolNames: Array.from(toolNamesSet),
    allowsAllTools,
  };
}

/**
 * Hook to get all organization roles (built-in + custom)
 *
 * @returns List of roles available for the organization
 */
export function useOrganizationRoles() {
  const { locator } = useProjectContext();

  const {
    data: customRolesData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: KEYS.organizationRoles(locator),
    queryFn: async () => {
      try {
        const result = await authClient.organization.listRoles();

        if (result?.error) {
          console.error("[useOrganizationRoles] API error:", result.error);
          return [];
        }

        return result?.data ?? [];
      } catch (err) {
        console.error("[useOrganizationRoles] Fetch error:", err);
        return [];
      }
    },
    staleTime: 30000, // Cache for 30 seconds
  });

  // Combine built-in roles with custom roles
  const allRoles: OrganizationRole[] = BUILTIN_ROLES.map((r) => ({
    role: r.value,
    label: r.label,
    isBuiltin: r.isBuiltin,
  }));

  // Add custom roles from API response
  if (customRolesData && Array.isArray(customRolesData)) {
    for (const customRole of customRolesData) {
      const roleName = customRole.role;
      if (!roleName) continue;

      // Skip if it's a built-in role name (owner, admin, user)
      if (BUILTIN_ROLES.some((b) => b.value === roleName)) {
        continue;
      }

      const {
        staticPermissions,
        allowsAllStaticPermissions,
        connectionIds,
        allowsAllConnections,
        toolNames,
        allowsAllTools,
      } = parsePermission(customRole.permission);

      allRoles.push({
        id: customRole.id,
        role: roleName,
        label: formatRoleLabel(roleName),
        isBuiltin: false,
        permission: customRole.permission ?? undefined,
        // Static permissions
        staticPermissionCount: allowsAllStaticPermissions
          ? -1
          : staticPermissions.length,
        allowsAllStaticPermissions,
        // Connection permissions
        connectionCount: allowsAllConnections ? -1 : connectionIds.length,
        allowsAllConnections,
        toolCount: allowsAllTools ? -1 : toolNames.length,
        allowsAllTools,
      });
    }
  }

  // Custom roles reversed so oldest first, newest last
  const customRoles = allRoles.filter((r) => !r.isBuiltin);

  return {
    roles: allRoles,
    customRoles,
    builtinRoles: allRoles.filter((r) => r.isBuiltin),
    isLoading,
    error,
    refetch,
  };
}

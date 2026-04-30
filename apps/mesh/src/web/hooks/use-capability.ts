/**
 * useCapability Hook
 *
 * Resolves whether the current user has a given permission capability based on
 * their organization role. Drives proactive UX gating (hide/disable) so users
 * don't see actions that will fail at the API.
 *
 * Resolution rules (mirror AccessControl on the server):
 *  - owner / admin built-in roles bypass all checks
 *  - basic-usage capability is granted to every authenticated member
 *  - custom roles must list every tool in the capability under "self" or have "self": ["*"]
 */

import {
  PERMISSION_CAPABILITIES,
  type PermissionCapability,
} from "@/tools/registry-metadata";
import { useOrganizationRoles } from "@/web/hooks/use-organization-roles";
import { authClient } from "@/web/lib/auth-client";
import { KEYS } from "@/web/lib/query-keys";
import { useProjectContext } from "@decocms/mesh-sdk";
import { useQuery } from "@tanstack/react-query";

export type CapabilityId =
  | "org:manage"
  | "members:manage"
  | "tags:manage"
  | "connections:manage"
  | "agents:manage"
  | "automations:manage"
  | "monitoring:view"
  | "ai-providers:manage"
  | "registry:manage"
  | "registry:monitor"
  | "api-keys:manage"
  | "event-bus:use"
  | "storage:delete"
  | "connections:sql";

const BUILTIN_BYPASS_ROLES = new Set(["owner", "admin"]);

function findCapability(id: CapabilityId): PermissionCapability | undefined {
  return PERMISSION_CAPABILITIES.find((c) => c.id === id);
}

function rolePermits(
  permission: Record<string, string[]> | undefined,
  capability: PermissionCapability,
): boolean {
  if (!permission) return false;
  const granted = permission.self ?? [];
  if (granted.includes("*")) return true;
  return capability.tools.every((tool) => granted.includes(tool));
}

export interface CapabilityResult {
  granted: boolean;
  loading: boolean;
  reason: "loading" | "owner" | "admin" | "role" | "denied";
}

/**
 * Non-suspense member fetch. Tolerant of forbidden responses so it can be used
 * on pages where the current user might lack ORGANIZATION_MEMBER_LIST permission.
 */
function useCurrentMemberRole(): {
  roleSlug: string | undefined;
  loading: boolean;
} {
  const { locator } = useProjectContext();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;

  const { data, isLoading } = useQuery({
    queryKey: KEYS.members(locator),
    queryFn: async () => {
      try {
        return await authClient.organization.listMembers();
      } catch {
        return null;
      }
    },
    staleTime: 30_000,
    retry: false,
  });

  if (!userId) {
    return { roleSlug: undefined, loading: isLoading };
  }
  const members = (data?.data?.members ?? []) as Array<{
    role: string;
    user?: { id?: string };
  }>;
  const member = members.find((m) => m.user?.id === userId);
  return { roleSlug: member?.role, loading: isLoading };
}

/**
 * Returns whether the current user has the given capability in the active org.
 */
export function useCapability(id: CapabilityId): CapabilityResult {
  const { roleSlug, loading: roleLoading } = useCurrentMemberRole();
  const { roles, isLoading: rolesLoading } = useOrganizationRoles();

  const loading = roleLoading || rolesLoading;

  if (loading) {
    return { granted: false, loading: true, reason: "loading" };
  }

  if (!roleSlug) {
    return { granted: false, loading: false, reason: "denied" };
  }

  if (roleSlug === "owner") {
    return { granted: true, loading: false, reason: "owner" };
  }
  if (roleSlug === "admin") {
    return { granted: true, loading: false, reason: "admin" };
  }

  const capability = findCapability(id);
  if (!capability) {
    return { granted: false, loading: false, reason: "denied" };
  }

  const role = roles.find((r) => r.role === roleSlug);
  const granted = rolePermits(role?.permission, capability);

  return {
    granted,
    loading: false,
    reason: granted ? "role" : "denied",
  };
}

/**
 * Returns a map of all capability ids → granted booleans for the current user.
 * Use when you need to gate multiple things on one screen.
 */
export function useCapabilities(): {
  capabilities: Record<CapabilityId, boolean>;
  loading: boolean;
  isPrivileged: boolean;
  roleSlug: string | undefined;
} {
  const { roleSlug, loading: roleLoading } = useCurrentMemberRole();
  const { roles, isLoading: rolesLoading } = useOrganizationRoles();

  const loading = roleLoading || rolesLoading;
  const isPrivileged = roleSlug ? BUILTIN_BYPASS_ROLES.has(roleSlug) : false;
  const role = roleSlug ? roles.find((r) => r.role === roleSlug) : undefined;

  const capabilities = {} as Record<CapabilityId, boolean>;
  for (const cap of PERMISSION_CAPABILITIES) {
    if (cap.id === "basic-usage") continue;
    const id = cap.id as CapabilityId;
    if (loading || !roleSlug) {
      capabilities[id] = false;
      continue;
    }
    if (isPrivileged) {
      capabilities[id] = true;
      continue;
    }
    capabilities[id] = rolePermits(role?.permission, cap);
  }

  return { capabilities, loading, isPrivileged, roleSlug };
}

export const NO_PERMISSION_TOOLTIP =
  "You don't have permission to do this. Ask an admin to update your role.";

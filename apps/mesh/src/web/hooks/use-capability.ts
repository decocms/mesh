/**
 * useCapability Hook
 *
 * Resolves whether the current user has a given permission capability based on
 * their organization role. Drives proactive UX gating (hide/disable) so users
 * don't see actions that will fail at the API.
 *
 * Calls a custom server endpoint (/api/auth/custom/my-permissions) so members
 * can read their OWN role/permission without needing the admin-only listRoles.
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
  | "threads:view-all"
  | "chat:image-generation"
  | "chat:web-search"
  | "ai-providers:manage"
  | "registry:manage"
  | "registry:monitor"
  | "api-keys:manage"
  | "event-bus:use"
  | "storage:delete"
  | "connections:sql";

const BUILTIN_BYPASS_ROLES = new Set(["owner", "admin"]);

interface MyPermissionsResponse {
  role: string | null;
  permission: Record<string, string[]> | null;
}

function findCapability(id: CapabilityId): PermissionCapability | undefined {
  return PERMISSION_CAPABILITIES.find((c) => c.id === id);
}

function rolePermits(
  permission: Record<string, string[]> | null | undefined,
  capability: PermissionCapability,
): boolean {
  if (!permission) return false;
  // Capability tools are static org-level permissions, so they always live
  // under the `self` bucket. Per-connection grants (under connection IDs)
  // can include "*" actions from the auto-grant helper — those mean
  // "all tools on this connection", NOT "wildcard every capability", so we
  // must not aggregate them here or every member with any connection grant
  // would see every UI affordance.
  const selfTools = permission.self ?? [];
  if (selfTools.includes("*")) return true;
  return capability.tools.every((tool) => selfTools.includes(tool));
}

export interface CapabilityResult {
  granted: boolean;
  loading: boolean;
  reason: "loading" | "owner" | "admin" | "role" | "denied";
}

/**
 * Fetch the current user's role and permission via the custom endpoint.
 * This works for any authenticated org member, not just admins.
 */
function useMyPermissions(): {
  data: MyPermissionsResponse | undefined;
  loading: boolean;
} {
  const { locator } = useProjectContext();

  const { data, isLoading } = useQuery({
    queryKey: KEYS.myPermissions(locator),
    queryFn: async (): Promise<MyPermissionsResponse> => {
      const res = await fetch("/api/auth/custom/my-permissions", {
        credentials: "include",
      });
      if (!res.ok) {
        return { role: null, permission: null };
      }
      return (await res.json()) as MyPermissionsResponse;
    },
    staleTime: 30_000,
    retry: false,
  });

  return { data, loading: isLoading };
}

/**
 * Returns whether the current user has the given capability in the active org.
 */
export function useCapability(id: CapabilityId): CapabilityResult {
  const { data: session } = authClient.useSession();
  const { data, loading } = useMyPermissions();

  if (loading || !session?.user) {
    return { granted: false, loading: true, reason: "loading" };
  }

  const role = data?.role;
  if (!role) {
    return { granted: false, loading: false, reason: "denied" };
  }

  if (role === "owner") {
    return { granted: true, loading: false, reason: "owner" };
  }
  if (role === "admin") {
    return { granted: true, loading: false, reason: "admin" };
  }

  const capability = findCapability(id);
  if (!capability) {
    return { granted: false, loading: false, reason: "denied" };
  }

  const granted = rolePermits(data?.permission, capability);

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
  const { data: session } = authClient.useSession();
  const { data, loading } = useMyPermissions();

  const role = session?.user ? (data?.role ?? undefined) : undefined;
  const isPrivileged = role ? BUILTIN_BYPASS_ROLES.has(role) : false;

  const capabilities = {} as Record<CapabilityId, boolean>;
  for (const cap of PERMISSION_CAPABILITIES) {
    if (cap.id === "basic-usage") continue;
    const id = cap.id as CapabilityId;
    if (loading || !role) {
      capabilities[id] = false;
      continue;
    }
    if (isPrivileged) {
      capabilities[id] = true;
      continue;
    }
    capabilities[id] = rolePermits(data?.permission, cap);
  }

  return {
    capabilities,
    loading,
    isPrivileged,
    roleSlug: role,
  };
}

export const NO_PERMISSION_TOOLTIP =
  "You don't have permission to do this. Ask an admin to update your role.";

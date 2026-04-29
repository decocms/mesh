import { authClient } from "@/web/lib/auth-client";
import { KEYS } from "@/web/lib/query-keys";
import { useProjectContext } from "@decocms/mesh-sdk";
import { useQuery } from "@tanstack/react-query";

const ADMIN_ROLES = new Set(["owner", "admin"]);

/**
 * Returns the current user's org-level tool permissions.
 * Admins and owners get full access (isAdmin: true).
 * Returns loading: true while data is being fetched (fail open — show all items).
 *
 * Uses /api/auth/custom/my-role instead of organization.listRoles() because
 * listRoles() requires ac:["read"] which custom roles don't have.
 */
export function useCurrentMemberPermissions() {
  const { org } = useProjectContext();
  const { data: session } = authClient.useSession();

  const orgId = org?.id;

  const { data, isLoading } = useQuery({
    queryKey: KEYS.myRolePermissions(orgId),
    queryFn: async (): Promise<{
      role: string;
      permission: Record<string, string[]> | null;
    } | null> => {
      const res = await fetch("/api/auth/custom/my-role");
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!session && !!orgId,
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return {
      isAdmin: false,
      tools: new Set<string>(),
      hasAll: false,
      isLoading: true,
    };
  }

  if (ADMIN_ROLES.has(data.role)) {
    return {
      isAdmin: true,
      tools: new Set<string>(),
      hasAll: true,
      isLoading: false,
    };
  }

  const selfTools: string[] = data.permission?.["self"] ?? [];

  if (selfTools.includes("*")) {
    return {
      isAdmin: false,
      tools: new Set<string>(),
      hasAll: true,
      isLoading: false,
    };
  }

  return {
    isAdmin: false,
    tools: new Set(selfTools),
    hasAll: false,
    isLoading: false,
  };
}

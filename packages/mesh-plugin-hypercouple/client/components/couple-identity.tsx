/**
 * Couple Identity Display
 *
 * Shows the couple's identity in the workspace:
 * - Partner avatars as colored initial circles
 * - Dynamic workspace name ("Gui & Ana's Space" or "Gui's Space")
 * - Auto-updates org name when second partner joins
 */

import { usePluginContext } from "@decocms/mesh-sdk/plugins";
import { cn } from "@deco/ui/lib/utils.ts";
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { useQuery } from "@tanstack/react-query";

// Standalone auth client (plugin packages cannot use @/ path alias)
const authClient = createAuthClient({
  plugins: [organizationClient()],
});

/**
 * Centralized query keys for the hypercouple plugin.
 * Plugin packages cannot import from @/web/lib/query-keys.
 */
export const KEYS = {
  members: (orgId?: string) => ["hypercouple", "members", orgId] as const,
};

/** Avatar color palette for partners */
const AVATAR_COLORS = [
  {
    bg: "bg-rose-100 dark:bg-rose-900/40",
    text: "text-rose-600 dark:text-rose-300",
  },
  {
    bg: "bg-violet-100 dark:bg-violet-900/40",
    text: "text-violet-600 dark:text-violet-300",
  },
] as const;

interface Member {
  id: string;
  userId: string;
  role: string;
  user: {
    name: string;
    email: string;
    image?: string | null;
  };
}

/**
 * Build the couple workspace name from member names.
 * - 1 member: "Gui's Space"
 * - 2 members: "Gui & Ana's Space"
 */
function buildWorkspaceName(members: Member[]): string {
  if (members.length === 0) return "Your Space";

  const names = members.map((m) => m.user.name?.split(" ")[0] ?? "Partner");

  if (names.length === 1) {
    return `${names[0]}'s Space`;
  }

  // Truncate long names
  const displayName1 = names[0].slice(0, 20);
  const displayName2 = names[1].slice(0, 20);

  return `${displayName1} & ${displayName2}'s Space`;
}

/**
 * Get the initial letter for an avatar.
 */
function getInitial(name: string): string {
  return (name?.trim()?.[0] ?? "?").toUpperCase();
}

interface CoupleIdentityProps {
  /** Compact mode for use in headers */
  compact?: boolean;
}

// Track whether we've already attempted org rename in this session
let hasAttemptedRename = false;

/**
 * Hook to fetch org members for the couple identity.
 * Returns members list, loading state, and member count.
 * Also handles auto-rename when second partner joins (inside queryFn to avoid useEffect).
 */
export function useCoupleMembers() {
  const { org } = usePluginContext({ partial: true });

  const query = useQuery({
    queryKey: KEYS.members(org?.id),
    queryFn: async () => {
      const result = await authClient.organization.listMembers();
      const members = (result.data?.members ?? []) as Member[];

      // Auto-rename org when second partner joins
      // Done inside queryFn to avoid useEffect (banned in this codebase)
      if (
        members.length === 2 &&
        !hasAttemptedRename &&
        org?.name &&
        !org.name.includes("&")
      ) {
        const expectedName = buildWorkspaceName(members);
        if (org.name !== expectedName) {
          hasAttemptedRename = true;
          // Non-blocking: rename failure should not break the UI
          authClient.organization
            .update({ data: { name: expectedName } })
            .catch(() => {
              hasAttemptedRename = false;
            });
        }
      }

      return members;
    },
    enabled: !!org?.id,
    staleTime: 30_000, // Cache for 30s
  });

  return {
    members: (query.data ?? []) as Member[],
    isLoading: query.isLoading,
    memberCount: query.data?.length ?? 0,
    refetch: query.refetch,
  };
}

/**
 * CoupleIdentity component.
 * Displays partner avatars and workspace name.
 */
export default function CoupleIdentity({
  compact = false,
}: CoupleIdentityProps) {
  const { org } = usePluginContext({ partial: true });
  const { members, isLoading, memberCount } = useCoupleMembers();

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-3", compact && "gap-2")}>
        <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  const workspaceName =
    members.length > 0
      ? buildWorkspaceName(members)
      : (org?.name ?? "Your Space");

  return (
    <div className={cn("flex items-center gap-3", compact && "gap-2")}>
      {/* Partner avatars */}
      <div className="flex items-center -space-x-2">
        {members.length === 0 ? (
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground">
            ?
          </div>
        ) : (
          members.slice(0, 2).map((member, index) => (
            <div
              key={member.id}
              className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ring-2 ring-background",
                AVATAR_COLORS[index]?.bg,
                AVATAR_COLORS[index]?.text,
              )}
              title={member.user.name}
            >
              {getInitial(member.user.name)}
            </div>
          ))
        )}
      </div>

      {/* Workspace name */}
      {!compact && (
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{workspaceName}</p>
          <p className="text-xs text-muted-foreground">
            {memberCount === 2
              ? "Both partners are here!"
              : `${memberCount} of 2 partners`}
          </p>
        </div>
      )}
    </div>
  );
}

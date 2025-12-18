import { EmptyState } from "@/web/components/empty-state.tsx";
import { useMembers } from "@/web/hooks/use-members";
import { useProjectContext } from "@/web/providers/project-context-provider";
import { Avatar } from "@deco/ui/components/avatar.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { useNavigate } from "@tanstack/react-router";
import { HomeGauge } from "./home-gauge.tsx";
import { HomeGridCell } from "./home-grid-cell.tsx";

function getInitials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0]?.charAt(0)}${parts[parts.length - 1]?.charAt(0)}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function MembersGaugeContent() {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const { data: membersResponse } = useMembers();

  const totalMembers = membersResponse?.data?.total ?? 0;
  const members = membersResponse?.data?.members ?? [];
  const firstThreeMembers = members.slice(0, 3);

  const handleGoToMembers = () => {
    navigate({
      to: "/$org/members",
      params: { org: org.slug },
    });
  };

  if (totalMembers <= 1) {
    return (
      <HomeGridCell
        title={
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg">
              <Icon name="group" size={16} />
            </span>
            Members
          </div>
        }
        description="Organization members"
      >
        <EmptyState
          image={null}
          title="Invite team members"
          description="Collaborate with your team by inviting members to this organization."
          actions={
            <button
              onClick={handleGoToMembers}
              className="text-sm text-primary hover:underline"
            >
              Invite members
            </button>
          }
        />
      </HomeGridCell>
    );
  }

  return (
    <HomeGridCell
      title={
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-lg">
            <Icon name="group" size={16} />
          </span>
          Members
        </div>
      }
      description="Organization members"
      action={
        <Button variant="ghost" size="sm" onClick={handleGoToMembers}>
          View all
          <Icon name="chevron_right" size={16} />
        </Button>
      }
    >
      <div className="flex items-center gap-6 w-full">
        {/* Left: Gauge */}
        <div className="flex-shrink-0">
          <HomeGauge value={totalMembers} label="members" />
        </div>

        {/* Right: List of first 3 members */}
        {firstThreeMembers.length > 0 && (
          <div className="flex-1 min-w-0 space-y-2">
            {firstThreeMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 hover:bg-muted/40 transition-colors"
              >
                <Avatar
                  url={member.user?.image ?? undefined}
                  fallback={getInitials(member.user?.name)}
                  shape="circle"
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">
                    {member.user?.name || "Unknown"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {member.user?.email}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </HomeGridCell>
  );
}

function MembersGaugeSkeleton() {
  return (
    <HomeGridCell
      title={
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-lg">
            <Icon name="group" size={16} />
          </span>
          Members
        </div>
      }
      description="Organization members"
    >
      <div className="flex items-center gap-6 w-full">
        <div className="h-[180px] w-[180px] rounded-full bg-muted animate-pulse flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    </HomeGridCell>
  );
}

export const MembersGauge = Object.assign(MembersGaugeContent, {
  Skeleton: MembersGaugeSkeleton,
});

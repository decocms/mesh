import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/web/lib/auth-client";
import { Avatar } from "@deco/ui/components/avatar.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import { ChevronDown, ChevronSelectorVertical } from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { ORG_ADMIN_PROJECT_SLUG, useProjectContext } from "@decocms/mesh-sdk";
import { ENABLE_PROJECTS } from "@/web/lib/feature-flags";
import { UserPanel } from "./user-panel";
import { OrgPanel } from "./org-panel";
import { ProjectPanel } from "./project-panel";
import { CreateOrganizationDialog } from "@/web/components/create-organization-dialog";
import { UserSettingsDialog } from "@/web/components/user-settings-dialog";

interface MeshAccountSwitcherProps {
  isCollapsed?: boolean;
  /** Visual variant - "light" (default) for org sidebar, "dark" for project sidebar */
  variant?: "light" | "dark";
  /** Callback when creating a new project */
  onCreateProject?: () => void;
}

export function MeshAccountSwitcher({
  isCollapsed = false,
  variant = "light",
  onCreateProject,
}: MeshAccountSwitcherProps) {
  const { org: orgParam, project: projectParam } = useParams({ strict: false });
  const { data: organizations } = authClient.useListOrganizations();
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();
  const isDark = variant === "dark";

  // Get project context for showing current project name in dark variant
  const projectContext = useProjectContext();
  const currentProject = projectContext?.project;

  const currentOrg = organizations?.find(
    (organization) => organization.slug === orgParam,
  );

  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creatingOrganization, setCreatingOrganization] = useState(false);
  const [hoveredOrgId, setHoveredOrgId] = useState<string | null>(null);

  const user = session?.user;
  const userImage = (user as { image?: string } | undefined)?.image;

  // Get the hovered org or fall back to current org
  const hoveredOrg = hoveredOrgId
    ? organizations?.find((o) => o.id === hoveredOrgId)
    : currentOrg;

  const handleOrgSettings = (orgSlug: string) => {
    setOpen(false);
    navigate({
      to: "/$org/$project/settings",
      params: { org: orgSlug, project: ORG_ADMIN_PROJECT_SLUG },
    });
  };

  const handleSelectOrg = (orgSlug: string) => {
    setOpen(false);
    navigate({
      to: "/$org/$project",
      params: { org: orgSlug, project: ORG_ADMIN_PROJECT_SLUG },
    });
  };

  const handleSelectProject = (orgSlug: string, projectSlug: string) => {
    setOpen(false);
    navigate({
      to: "/$org/$project",
      params: { org: orgSlug, project: projectSlug },
    });
  };

  const handleProjectSettings = (orgSlug: string, projectSlug: string) => {
    setOpen(false);
    navigate({
      to: "/$org/$project/settings",
      params: { org: orgSlug, project: projectSlug },
    });
  };

  const handleCreateProject = onCreateProject
    ? () => {
        setOpen(false);
        onCreateProject();
      }
    : undefined;

  // Reset hovered org when popover closes
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setHoveredOrgId(null);
    }
  };

  // When popover opens, default to hovering the current org
  const handlePopoverOpen = () => {
    if (currentOrg) {
      setHoveredOrgId(currentOrg.id);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePopoverOpen}
            className={cn(
              "h-7 min-w-0 max-w-full",
              isDark
                ? "hover:bg-zinc-800 text-white"
                : "hover:bg-sidebar-accent",
              isCollapsed ? "justify-center" : "justify-start",
              isCollapsed ? "" : "pl-0.5! px-1.5 gap-1.5",
            )}
          >
            <Avatar
              url={currentOrg?.logo ?? ""}
              fallback={currentOrg?.name ?? ""}
              size="xs"
              className={cn("shrink-0 rounded-[5px]", isDark && "border-none")}
              objectFit="cover"
            />
            {!isCollapsed && (
              <>
                <div className={cn("min-w-0 text-left", isDark && "flex-1")}>
                  {isDark && currentProject ? (
                    <>
                      <p className="text-[10px] text-zinc-500 leading-none truncate">
                        {currentOrg?.name ?? "Select org"}
                      </p>
                      <p className="text-sm text-white font-normal leading-tight mt-0.5 truncate">
                        {currentProject.name ?? currentProject.slug}
                      </p>
                    </>
                  ) : (
                    <span className="truncate text-[14px] tracking-[-0.00625rem] font-medium text-foreground">
                      {currentOrg?.name ?? "Select org"}
                    </span>
                  )}
                </div>
                {isDark ? (
                  <ChevronSelectorVertical className="size-3 text-zinc-500 shrink-0" />
                ) : (
                  <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                )}
              </>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          side="bottom"
          className="p-0 flex w-auto h-88 overflow-hidden"
        >
          {/* User panel */}
          {user && (
            <UserPanel
              user={user}
              userImage={userImage}
              onOpenSettings={() => {
                setSettingsOpen(true);
                setOpen(false);
              }}
            />
          )}

          {/* Organization panel */}
          <OrgPanel
            currentOrgSlug={orgParam}
            hoveredOrgId={hoveredOrgId}
            onOrgSelect={handleSelectOrg}
            onOrgSettings={handleOrgSettings}
            onPopoverClose={() => setOpen(false)}
            onCreateOrganization={() => setCreatingOrganization(true)}
            onOrgHover={setHoveredOrgId}
          />

          {/* Project panel - shows projects for hovered org */}
          {ENABLE_PROJECTS && hoveredOrg && (
            <ProjectPanel
              organizationId={hoveredOrg.id}
              organizationName={hoveredOrg.name}
              orgSlug={hoveredOrg.slug}
              currentProjectSlug={
                hoveredOrg.slug === orgParam ? projectParam : undefined
              }
              onProjectSelect={handleSelectProject}
              onProjectSettings={handleProjectSettings}
              onCreateProject={handleCreateProject}
            />
          )}
        </PopoverContent>
      </Popover>

      {user && settingsOpen && user.email && (
        <UserSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          user={{ ...user, name: user.name ?? undefined, email: user.email }}
          userImage={userImage}
        />
      )}

      <CreateOrganizationDialog
        open={creatingOrganization}
        onOpenChange={setCreatingOrganization}
      />
    </>
  );
}

MeshAccountSwitcher.Skeleton = function MeshAccountSwitcherSkeleton({
  variant = "light",
}: {
  variant?: "light" | "dark";
}) {
  const isDark = variant === "dark";
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 h-7 px-1.5 w-full",
        isDark && "text-white",
      )}
    >
      <Skeleton
        className={cn("size-5 rounded-[5px] shrink-0", isDark && "bg-zinc-800")}
      />
      <Skeleton className={cn("h-3.5 flex-1", isDark && "bg-zinc-800")} />
    </div>
  );
};

import { Avatar } from "@deco/ui/components/avatar.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { useSidebar } from "@deco/ui/components/sidebar.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  Locator,
  ORG_ADMIN_PROJECT_SLUG,
  useProjectContext,
} from "@decocms/mesh-sdk";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronSelectorVertical,
  Plus,
} from "@untitledui/icons";
import { useProjects } from "@/web/hooks/use-project";

const ORG_ADMIN_PROJECT_NAME = "Organization Admin";

interface ProjectSwitcherProps {
  onCreateProject?: () => void;
  /** Visual variant - "default" for sidebar, "dark" for dark topbar */
  variant?: "default" | "dark";
  /** Whether to hide the icon (for compact topbar usage) */
  hideIcon?: boolean;
}

export function ProjectSwitcher({
  onCreateProject,
  variant = "default",
  hideIcon = false,
}: ProjectSwitcherProps) {
  const { org, project, locator } = useProjectContext();
  const navigate = useNavigate();
  const { state } = useSidebar();
  const isCollapsed = variant === "default" && state === "collapsed";
  const { data: projects, isLoading } = useProjects(org.id);
  const isOrgAdmin = Locator.isOrgAdminProject(locator);
  const isDark = variant === "dark";

  // Filter out org-admin from project list (it's shown separately)
  const userProjects =
    projects?.filter((p) => p.slug !== ORG_ADMIN_PROJECT_SLUG) ?? [];

  const handleNavigateToProject = (projectSlug: string) => {
    navigate({
      to: "/$org/$project",
      params: { org: org.slug, project: projectSlug },
    });
  };

  const handleBackToOrg = () => {
    navigate({
      to: "/$org/$project",
      params: { org: org.slug, project: ORG_ADMIN_PROJECT_SLUG },
    });
  };

  // Get display name for current project
  const currentProjectName = isOrgAdmin
    ? ORG_ADMIN_PROJECT_NAME
    : (project.name ?? project.slug);

  // Get theme color for current project
  const projectThemeColor = project.ui?.themeColor ?? "#3B82F6";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 transition-colors text-left",
            isDark
              ? "hover:opacity-80"
              : cn(
                  "rounded-lg hover:bg-sidebar-accent w-full",
                  isCollapsed ? "justify-center p-1.5" : "px-2 py-1.5",
                ),
          )}
        >
          {/* Project Icon - hidden in dark variant or when hideIcon */}
          {!hideIcon && !isDark && (
            <>
              {project.ui?.icon ? (
                <img
                  src={project.ui.icon}
                  alt=""
                  className="size-7 rounded-lg object-cover shrink-0"
                />
              ) : (
                <Avatar
                  fallback={currentProjectName}
                  size="xs"
                  shape="square"
                  className="shrink-0"
                  style={
                    !isOrgAdmin
                      ? { backgroundColor: projectThemeColor }
                      : undefined
                  }
                />
              )}
            </>
          )}

          {/* Names - hidden when collapsed (sidebar only) */}
          {!isCollapsed && (
            <>
              <div className={cn("min-w-0", !isDark && "flex-1")}>
                <p
                  className={cn(
                    "truncate leading-none",
                    isDark
                      ? "text-[10px] text-zinc-500"
                      : "text-[11px] text-muted-foreground leading-tight",
                  )}
                >
                  {org.name}
                </p>
                <p
                  className={cn(
                    "truncate leading-none mt-0.5",
                    isDark
                      ? "text-sm text-white font-normal"
                      : "text-sm font-medium leading-tight",
                  )}
                >
                  {currentProjectName}
                </p>
              </div>

              {isDark ? (
                <ChevronSelectorVertical className="size-3 text-zinc-500 shrink-0" />
              ) : (
                <ChevronDown className="size-4 text-muted-foreground shrink-0" />
              )}
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        {/* Back to Organization (when in a project) */}
        {!isOrgAdmin && (
          <>
            <DropdownMenuItem onClick={handleBackToOrg}>
              <ArrowLeft className="size-4" />
              Back to Organization
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Organization Admin */}
        <DropdownMenuItem
          onClick={() => handleNavigateToProject(ORG_ADMIN_PROJECT_SLUG)}
          className={cn(isOrgAdmin && "bg-accent")}
        >
          <Avatar
            fallback="O"
            size="2xs"
            shape="square"
            className="bg-zinc-900 text-white"
          />
          <span className="flex-1">{ORG_ADMIN_PROJECT_NAME}</span>
          {isOrgAdmin && <Check className="size-4" />}
        </DropdownMenuItem>

        {/* User Projects */}
        {isLoading ? (
          <div className="px-2 py-1.5 space-y-1">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          userProjects.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5">
                <p className="text-xs text-muted-foreground font-medium">
                  Projects
                </p>
              </div>
              {userProjects.map((p) => {
                const isCurrentProject =
                  p.id === project.id || p.slug === project.slug;
                return (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => handleNavigateToProject(p.slug)}
                    className={cn(isCurrentProject && "bg-accent")}
                  >
                    {p.ui?.icon ? (
                      <img
                        src={p.ui.icon}
                        alt=""
                        className="size-4 rounded object-cover"
                      />
                    ) : (
                      <Avatar
                        fallback={p.name}
                        size="2xs"
                        shape="square"
                        style={{
                          backgroundColor: p.ui?.themeColor ?? "#3B82F6",
                        }}
                      />
                    )}
                    <span className="flex-1 truncate">{p.name}</span>
                    {isCurrentProject && <Check className="size-4" />}
                  </DropdownMenuItem>
                );
              })}
            </>
          )
        )}

        {/* Create New Project */}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCreateProject}>
          <Plus className="size-4" />
          New Project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

ProjectSwitcher.Skeleton = function ProjectSwitcherSkeleton() {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 w-full">
      <Skeleton className="size-7 rounded-lg shrink-0" />
      <div className="flex-1 min-w-0 space-y-1">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
};

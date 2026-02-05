import { Avatar } from "@deco/ui/components/avatar.tsx";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { ORG_ADMIN_PROJECT_SLUG } from "@decocms/mesh-sdk";
import { Check, Plus, Settings02 } from "@untitledui/icons";
import { Suspense, useState } from "react";
import { useProjects, type ProjectWithBindings } from "@/web/hooks/use-project";

interface ProjectItemProps {
  project: ProjectWithBindings & { organizationId: string };
  isActive?: boolean;
  onClick?: () => void;
  onSettings?: () => void;
}

function ProjectItem({
  project,
  isActive,
  onClick,
  onSettings,
}: ProjectItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const showSettings = isActive || isHovered;
  const themeColor = project.ui?.themeColor ?? "#3B82F6";

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "flex items-center gap-2 w-full justify-start font-normal h-10 px-2 rounded-lg cursor-pointer transition-colors hover:bg-accent/50",
        isActive && "bg-accent hover:bg-accent",
      )}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {project.ui?.icon ? (
        <img
          src={project.ui.icon}
          alt=""
          className="size-6 rounded-md object-cover shrink-0"
        />
      ) : (
        <Avatar
          fallback={project.name}
          size="sm"
          shape="square"
          className="size-6 shrink-0 rounded-md"
          style={{ backgroundColor: themeColor }}
        />
      )}
      <span className="flex-1 text-sm text-foreground truncate text-left min-w-0">
        {project.name}
      </span>
      {isActive && (
        <Check size={16} className="text-muted-foreground shrink-0" />
      )}
      {/* Settings button - always reserve space to prevent CLS */}
      {onSettings && showSettings && !isActive ? (
        <button
          type="button"
          aria-label={`${project.name} settings`}
          className="size-5 shrink-0 flex items-center justify-center rounded-md transition-colors hover:bg-foreground/10"
          onClick={(e) => {
            e.stopPropagation();
            onSettings();
          }}
        >
          <Settings02 size={16} className="text-muted-foreground" />
        </button>
      ) : !isActive ? (
        <span className="size-5 shrink-0" aria-hidden="true" />
      ) : null}
    </div>
  );
}

function ProjectListSkeleton() {
  return (
    <div className="space-y-1 px-2 py-1">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

interface ProjectListProps {
  organizationId: string;
  currentProjectSlug?: string;
  onProjectSelect: (orgSlug: string, projectSlug: string) => void;
  onProjectSettings?: (orgSlug: string, projectSlug: string) => void;
  orgSlug: string;
}

function ProjectList({
  organizationId,
  currentProjectSlug,
  onProjectSelect,
  onProjectSettings,
  orgSlug,
}: ProjectListProps) {
  const { data: projects } = useProjects(organizationId);

  // Filter out org-admin from user projects
  const userProjects =
    projects?.filter((p) => p.slug !== ORG_ADMIN_PROJECT_SLUG) ?? [];

  if (userProjects.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-sm text-muted-foreground">
        No projects yet
      </div>
    );
  }

  return (
    <>
      {userProjects.map((project) => (
        <ProjectItem
          key={project.id}
          project={project}
          isActive={currentProjectSlug === project.slug}
          onClick={() => onProjectSelect(orgSlug, project.slug)}
          onSettings={
            onProjectSettings
              ? () => onProjectSettings(orgSlug, project.slug)
              : undefined
          }
        />
      ))}
    </>
  );
}

interface ProjectPanelProps {
  organizationId: string;
  organizationName: string;
  currentProjectSlug?: string;
  onProjectSelect: (orgSlug: string, projectSlug: string) => void;
  onProjectSettings?: (orgSlug: string, projectSlug: string) => void;
  onCreateProject?: () => void;
  orgSlug: string;
}

export function ProjectPanel({
  organizationId,
  organizationName,
  currentProjectSlug,
  onProjectSelect,
  onProjectSettings,
  onCreateProject,
  orgSlug,
}: ProjectPanelProps) {
  return (
    <div className="flex flex-col min-w-[250px] border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between h-10 px-3 border-b border-border">
        <span className="text-xs text-muted-foreground truncate">
          Projects in {organizationName}
        </span>
        {onCreateProject && (
          <button
            type="button"
            className="size-5 shrink-0 flex items-center justify-center rounded-md transition-colors hover:bg-foreground/10"
            onClick={onCreateProject}
            aria-label="Create project"
          >
            <Plus size={16} className="text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Project list - wrapped in Suspense for instant hover response */}
      <div className="flex flex-col gap-0.5 p-1 flex-1 overflow-y-auto">
        <Suspense fallback={<ProjectListSkeleton />}>
          <ProjectList
            organizationId={organizationId}
            currentProjectSlug={currentProjectSlug}
            onProjectSelect={onProjectSelect}
            onProjectSettings={onProjectSettings}
            orgSlug={orgSlug}
          />
        </Suspense>
      </div>
    </div>
  );
}

import { Suspense, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@deco/ui/components/sidebar.tsx";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@deco/ui/components/collapsible.tsx";
import { ChevronDown, ChevronRight, Plus } from "@untitledui/icons";
import { ORG_ADMIN_PROJECT_SLUG, useProjectContext } from "@decocms/mesh-sdk";
import { useProjects, type ProjectWithBindings } from "@/web/hooks/use-project";
import { CreateProjectDialog } from "@/web/components/create-project-dialog";
import { cn } from "@deco/ui/lib/utils.ts";

function ProjectIcon({
  project,
}: {
  project: ProjectWithBindings & { organizationId: string };
}) {
  const themeColor = project.ui?.themeColor ?? "#60a5fa";

  if (project.ui?.icon) {
    return (
      <img
        src={project.ui.icon}
        alt=""
        className="size-4 shrink-0 rounded object-cover aspect-square border border-border/50"
      />
    );
  }

  return (
    <div
      className="size-4 shrink-0 rounded flex items-center justify-center aspect-square border border-border/50"
      style={{ backgroundColor: themeColor }}
    >
      <span className="text-[10px] font-medium text-white">
        {project.name.charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

function ProjectListItem({
  project,
}: {
  project: ProjectWithBindings & { organizationId: string };
}) {
  const navigate = useNavigate();
  const { org } = useProjectContext();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className="group/item cursor-pointer text-foreground/90 hover:text-foreground"
        onClick={() => {
          navigate({
            to: "/$org/$project",
            params: { org: org.slug, project: project.slug },
          });
        }}
        tooltip={project.name}
      >
        <span className="flex items-center justify-center shrink-0 [&>img]:size-4 [&>div]:size-4">
          <ProjectIcon project={project} />
        </span>
        <span className="truncate flex-1">{project.name}</span>
        <ChevronRight
          size={12}
          className="text-muted-foreground opacity-0 group-hover/item:opacity-100 transition-opacity"
        />
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function ProjectsSectionContent() {
  const { org } = useProjectContext();
  const { data: projects, isLoading } = useProjects(org.id);
  const [isOpen, setIsOpen] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Filter out org-admin project
  const userProjects =
    projects?.filter((p) => p.slug !== ORG_ADMIN_PROJECT_SLUG) ?? [];

  if (isLoading) {
    return (
      <SidebarGroup className="py-0">
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5">
            <SidebarMenuItem>
              <div className="flex items-center gap-2 px-2 py-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 flex-1" />
              </div>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <div className="flex items-center gap-2 px-2 py-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 flex-1" />
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <>
      <SidebarSeparator className="my-2" />
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <SidebarGroup className="py-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {/* Section Header — text when expanded, dash when collapsed */}
              <SidebarMenuItem>
                <div className="flex items-center px-2 h-6">
                  {/* Expanded: label + chevron + add button */}
                  <div className="group-data-[collapsible=icon]:hidden flex items-center justify-between w-full">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <span>Projects</span>
                        <ChevronDown
                          size={12}
                          className={cn(
                            "transition-transform",
                            !isOpen && "-rotate-90",
                          )}
                        />
                      </button>
                    </CollapsibleTrigger>
                    <button
                      type="button"
                      onClick={() => setCreateDialogOpen(true)}
                      className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded hover:bg-accent"
                      title="Create new project"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  {/* Collapsed: dash */}
                  <div className="hidden group-data-[collapsible=icon]:block mx-auto w-4 h-px bg-border" />
                </div>
              </SidebarMenuItem>

              {/* Collapsed sidebar: show + button when no projects */}
              {userProjects.length === 0 && (
                <SidebarMenuItem className="hidden group-data-[collapsible=icon]:block">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton
                        className="cursor-pointer text-muted-foreground hover:text-foreground"
                        onClick={() => setCreateDialogOpen(true)}
                      >
                        <Plus size={16} />
                        <span className="truncate">Add project</span>
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent side="right">Add project</TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>
              )}

              {/* Project List */}
              <CollapsibleContent>
                {userProjects.length === 0 ? (
                  <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
                    <div className="px-2 py-2 text-xs text-muted-foreground">
                      No projects yet
                    </div>
                  </SidebarMenuItem>
                ) : (
                  userProjects.map((project) => (
                    <ProjectListItem key={project.id} project={project} />
                  ))
                )}
              </CollapsibleContent>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </Collapsible>

      <CreateProjectDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </>
  );
}

export function SidebarProjectsSection() {
  return (
    <Suspense
      fallback={
        <SidebarGroup className="py-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              <SidebarMenuItem>
                <div className="flex items-center gap-2 px-2 py-2">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      }
    >
      <ProjectsSectionContent />
    </Suspense>
  );
}

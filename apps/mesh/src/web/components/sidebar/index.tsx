/**
 * MeshSidebar — Icon rail + session list layout.
 *
 * The sidebar is split into two columns:
 * 1. A narrow icon rail (project icons, +, gear, help)
 * 2. A wider session/task list panel
 *
 * No traditional nav items (Home, Tasks, Agents, Connections).
 * All management lives in Settings.
 */

import { ErrorBoundary } from "@/web/components/error-boundary";
import { authClient } from "@/web/lib/auth-client";
import { Avatar } from "@deco/ui/components/avatar.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import { LogOut01 } from "@untitledui/icons";
import { AgentAvatar } from "@/web/components/agent-icon";
import { useProjects } from "@/web/hooks/use-projects";
import { useSettingsModal } from "@/web/hooks/use-settings-modal";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  ORG_ADMIN_PROJECT_SLUG,
  useProjectContext,
  type VirtualMCPEntity,
} from "@decocms/mesh-sdk";
import { Plus, Settings01 } from "@untitledui/icons";
import { useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";

// Legacy type exports (kept for reference, used by dead sidebar hooks)
export type { Invitation } from "./types";

// ---------------------------------------------------------------------------
// Icon Rail — project icons stacked vertically
// ---------------------------------------------------------------------------

function ProjectRailIcon({
  project,
  isActive,
}: {
  project: VirtualMCPEntity;
  isActive: boolean;
}) {
  const navigate = useNavigate();
  const { org } = useProjectContext();
  const slug = (project.metadata as { projectSlug?: string })?.projectSlug;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => {
            if (!slug) return;
            navigate({
              to: "/$org/$project",
              params: { org: org.slug, project: slug },
            });
          }}
          className={cn(
            "size-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150",
            "hover:scale-105 hover:shadow-md",
            isActive
              ? "ring-2 ring-foreground/20 shadow-sm"
              : "opacity-80 hover:opacity-100",
          )}
        >
          <AgentAvatar
            icon={project.icon ?? null}
            name={project.title}
            size="sm"
            className="!w-10 !h-10 !rounded-xl"
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {project.title}
      </TooltipContent>
    </Tooltip>
  );
}

function StudioRailIcon({ isActive }: { isActive: boolean }) {
  const navigate = useNavigate();
  const { org } = useProjectContext();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() =>
            navigate({
              to: "/$org/$project",
              params: { org: org.slug, project: ORG_ADMIN_PROJECT_SLUG },
            })
          }
          className={cn(
            "size-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150",
            "bg-sidebar-accent border border-border/50",
            "hover:scale-105 hover:shadow-md",
            isActive && "ring-2 ring-foreground/20 shadow-sm",
          )}
        >
          <span className="text-sm font-semibold text-foreground/70">S</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        Studio
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// New Workspace Button
// ---------------------------------------------------------------------------

function NewWorkspaceButton() {
  const navigate = useNavigate();
  const { org } = useProjectContext();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() =>
            navigate({
              to: "/$org/$project",
              params: { org: org.slug, project: ORG_ADMIN_PROJECT_SLUG },
            })
          }
          className={cn(
            "size-10 rounded-xl flex items-center justify-center shrink-0",
            "border border-dashed border-border/60",
            "text-muted-foreground hover:text-foreground",
            "hover:bg-sidebar-accent hover:border-border transition-all duration-150",
          )}
        >
          <Plus size={18} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        New workspace
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Rail User Menu — icon-only avatar with dropdown
// ---------------------------------------------------------------------------

function RailUserMenu() {
  const { data: session } = authClient.useSession();
  const { open: openSettings } = useSettingsModal();

  const user = session?.user;
  const userImage = (user as { image?: string } | undefined)?.image;
  const fallback = user?.name || user?.email || "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="size-10 rounded-full flex items-center justify-center hover:opacity-80 transition-opacity"
        >
          <Avatar
            url={userImage}
            fallback={fallback}
            shape="circle"
            size="xs"
            className="size-8"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="end"
        sideOffset={8}
        className="w-56"
      >
        {user && (
          <>
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium truncate">
                {user.name || "User"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user.email}
              </p>
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          className="gap-2.5"
          onClick={() => openSettings("account.preferences")}
        >
          <Settings01 size={14} className="shrink-0 text-muted-foreground" />
          <span>Account settings</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2.5"
          onClick={() => authClient.signOut()}
        >
          <LogOut01 size={14} className="shrink-0 text-muted-foreground" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Icon Rail Content
// ---------------------------------------------------------------------------

function IconRailContent() {
  const { project } = useProjectContext();
  const { data: projects, isLoading } = useProjects();
  const { open: openSettings } = useSettingsModal();

  const currentProjectSlug = project.slug;
  const isStudio = currentProjectSlug === ORG_ADMIN_PROJECT_SLUG;

  return (
    <div className="flex flex-col items-center h-full pt-4 pb-3 px-2 gap-2">
      {/* Studio icon (org-admin) */}
      <StudioRailIcon isActive={isStudio} />

      {/* Divider */}
      <div className="w-6 h-px bg-border/50 my-0.5" />

      {/* + button */}
      <NewWorkspaceButton />

      {/* Project icons */}
      {isLoading ? (
        <>
          <Skeleton className="size-10 rounded-xl" />
          <Skeleton className="size-10 rounded-xl" />
        </>
      ) : (
        (projects ?? []).map((p) => {
          const slug = (p.metadata as { projectSlug?: string })?.projectSlug;
          return (
            <ProjectRailIcon
              key={p.id}
              project={p}
              isActive={slug === currentProjectSlug}
            />
          );
        })
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Divider */}
      <div className="w-6 h-px bg-border/50 my-0.5" />

      {/* Settings */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => openSettings("org.general")}
            className="size-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          >
            <Settings01 size={18} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          Settings
        </TooltipContent>
      </Tooltip>

      {/* User menu */}
      <RailUserMenu />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Export — Two-column sidebar
// ---------------------------------------------------------------------------

interface MeshSidebarProps {
  onCreateProject?: () => void;
}

export function MeshSidebar({
  onCreateProject: _onCreateProject,
}: MeshSidebarProps) {
  return (
    <div className="w-16 shrink-0 h-full bg-sidebar overflow-visible">
      <ErrorBoundary>
        <Suspense
          fallback={
            <div className="flex flex-col items-center py-3 gap-2">
              <Skeleton className="size-10 rounded-xl" />
              <Skeleton className="size-10 rounded-xl" />
            </div>
          }
        >
          <IconRailContent />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

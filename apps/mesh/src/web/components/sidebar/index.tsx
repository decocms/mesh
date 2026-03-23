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
import {
  getDefaultAgentSpecs,
  type DefaultAgentSpec,
} from "@/constants/default-agents";
import { AgentAvatar } from "@/web/components/agent-icon";
import { useProjects, type ProjectWithBindings } from "@/web/hooks/use-project";
import { useSettingsModal } from "@/web/hooks/use-settings-modal";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@deco/ui/components/popover.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  ORG_ADMIN_PROJECT_SLUG,
  SELF_MCP_ALIAS_ID,
  useProjectContext,
  useVirtualMCPs,
  useMCPClient,
  useConnectionActions,
  useVirtualMCPActions,
} from "@decocms/mesh-sdk";
import { Plus, Settings01 } from "@untitledui/icons";
import { useNavigate } from "@tanstack/react-router";
import { Suspense, useState } from "react";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import { useInstallFromRegistry } from "@/web/hooks/use-install-from-registry";
import { createWorkspaceWithAgent } from "@/web/lib/create-workspace-with-agent";
import { toast } from "sonner";

// Legacy type exports (kept for reference, used by dead sidebar hooks)
export type { Invitation } from "./types";

// ---------------------------------------------------------------------------
// Icon Rail — project icons stacked vertically
// ---------------------------------------------------------------------------

function ProjectRailIcon({
  project,
  isActive,
  agentIcon,
}: {
  project: ProjectWithBindings & { organizationId: string };
  isActive: boolean;
  agentIcon?: string | null;
}) {
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
              params: { org: org.slug, project: project.slug },
            })
          }
          className={cn(
            "size-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150",
            "hover:scale-105 hover:shadow-md",
            isActive
              ? "ring-2 ring-foreground/20 shadow-sm"
              : "opacity-80 hover:opacity-100",
          )}
        >
          <AgentAvatar
            icon={agentIcon ?? project.ui?.icon ?? null}
            name={project.name}
            size="sm"
            className="!w-10 !h-10 !rounded-xl"
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {project.name}
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
// Agent Catalog Popover — shown when clicking "+"
// ---------------------------------------------------------------------------

function AgentCatalogPopover() {
  const [open, setOpen] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const specs = getDefaultAgentSpecs().slice(0, 12);
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const virtualMcps = useVirtualMCPs();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const connectionActions = useConnectionActions();
  const virtualMCPActions = useVirtualMCPActions();
  const { installByAppName } = useInstallFromRegistry();

  const handleSelect = async (spec: DefaultAgentSpec) => {
    if (creatingId) return;
    setCreatingId(spec.title);
    try {
      // Determine workspace type from spec
      const workspaceType = spec.title.toLowerCase().includes("slide")
        ? "slides"
        : spec.title.toLowerCase().includes("website") ||
            spec.title.toLowerCase().includes("deco")
          ? "website"
          : null;

      const result = await createWorkspaceWithAgent({
        spec,
        workspaceType,
        org,
        client,
        connectionActions,
        virtualMCPActions,
        installByAppName,
        existingVirtualMcps: virtualMcps as Array<{
          id: string;
          title: string;
          metadata?: Record<string, unknown> | null;
          connections?: unknown[];
        }>,
      });

      setOpen(false);
      navigate({
        to: "/$org/$project",
        params: { org: org.slug, project: result.projectSlug },
        search:
          result.oauthConnections.length > 0
            ? { setupConnections: JSON.stringify(result.oauthConnections) }
            : {},
      });
    } catch (err) {
      console.error("[AgentCatalog] Failed to create workspace:", err);
      toast.error(
        `Failed to create workspace: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setCreatingId(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "size-10 rounded-xl flex items-center justify-center shrink-0",
                "border border-dashed border-border/60",
                "text-muted-foreground hover:text-foreground",
                "hover:bg-sidebar-accent hover:border-border transition-all duration-150",
              )}
            >
              <Plus size={18} />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          New workspace
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={12}
        className="w-[320px] p-0"
      >
        <div className="p-3 border-b border-border">
          <h3 className="text-sm font-medium">New workspace</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pick a template to get started
          </p>
        </div>
        <div className="p-2 max-h-[400px] overflow-y-auto">
          {specs.map((spec) => (
            <button
              key={spec.title}
              type="button"
              onClick={() => handleSelect(spec)}
              disabled={creatingId !== null}
              className={cn(
                "flex items-center gap-3 w-full px-2 py-2 rounded-lg hover:bg-accent transition-colors text-left",
                creatingId === spec.title && "opacity-50",
                creatingId !== null &&
                  creatingId !== spec.title &&
                  "opacity-70",
              )}
            >
              <AgentAvatar icon={spec.icon} name={spec.title} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {spec.title}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {spec.description}
                </p>
              </div>
              {creatingId === spec.title && (
                <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin text-muted-foreground shrink-0" />
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
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
  const { org, project } = useProjectContext();
  const { data: projects, isLoading } = useProjects(org.id);
  const virtualMcps = useVirtualMCPs();
  const { open: openSettings } = useSettingsModal();

  // Build a map from projectSlug → agent icon
  const agentIconBySlug: Record<string, string | null> = {};
  for (const vmc of virtualMcps) {
    const slug = (vmc.metadata as { projectSlug?: string } | undefined)
      ?.projectSlug;
    if (slug && vmc.icon) {
      agentIconBySlug[slug] = vmc.icon;
    }
  }

  const currentProjectSlug = project.slug;
  const isStudio = currentProjectSlug === ORG_ADMIN_PROJECT_SLUG;

  // Filter out org-admin project
  const userProjects =
    projects?.filter((p) => p.slug !== ORG_ADMIN_PROJECT_SLUG) ?? [];

  return (
    <div className="flex flex-col items-center h-full pt-4 pb-3 px-2 gap-2">
      {/* Studio icon (org-admin) */}
      <StudioRailIcon isActive={isStudio} />

      {/* Divider */}
      <div className="w-6 h-px bg-border/50 my-0.5" />

      {/* + button with agent catalog */}
      <AgentCatalogPopover />

      {/* Project icons */}
      {isLoading ? (
        <>
          <Skeleton className="size-10 rounded-xl" />
          <Skeleton className="size-10 rounded-xl" />
        </>
      ) : (
        userProjects.map((p) => (
          <ProjectRailIcon
            key={p.id}
            project={p}
            isActive={p.slug === currentProjectSlug}
            agentIcon={agentIconBySlug[p.slug]}
          />
        ))
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

/**
 * WorkspaceTabs — Tab bar for workspaces with pinned views.
 *
 * Renders a horizontal tab bar at the top of the content area.
 * Each tab corresponds to a pinned view (MCP app) on the project.
 * Only shows when the project has pinnedViews configured.
 */

import { useProject } from "@/web/hooks/use-project";
import { cn } from "@deco/ui/lib/utils.ts";
import { useProjectContext } from "@decocms/mesh-sdk";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { PinnedView } from "@/storage/types";

export function WorkspaceTabs() {
  const { org, project } = useProjectContext();
  const { data: projectData } = useProject(org.id, project.slug);
  const navigate = useNavigate();
  const routerState = useRouterState();

  const pinnedViews = (
    projectData?.ui as { pinnedViews?: PinnedView[] | null } | null | undefined
  )?.pinnedViews;

  if (!pinnedViews || pinnedViews.length === 0) return null;

  const pathname = routerState.location.pathname;

  return (
    <div className="flex items-center gap-0.5 px-3 h-9 border-b border-border/50 bg-card shrink-0">
      {pinnedViews.map((view) => {
        const encodedToolName = encodeURIComponent(view.toolName);
        const isActive = pathname.includes(
          `/apps/${view.connectionId}/${encodedToolName}`,
        );

        return (
          <button
            key={`${view.connectionId}-${view.toolName}`}
            type="button"
            onClick={() =>
              navigate({
                to: "/$org/$project/apps/$connectionId/$toolName",
                params: {
                  org: org.slug,
                  project: project.slug,
                  connectionId: view.connectionId,
                  toolName: view.toolName,
                },
              })
            }
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-md transition-colors",
              isActive
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            {view.icon && (
              <img
                src={view.icon}
                alt=""
                className="size-3.5 rounded inline-block mr-1.5 -mt-px"
              />
            )}
            {view.label || view.toolName}
          </button>
        );
      })}
    </div>
  );
}

/**
 * ContentToolbar — Top bar on the main content panel.
 * Shows icons for available UI tools from the project's agents.
 * Clicking an icon switches the main view to that tool's UI.
 */

import { cn } from "@deco/ui/lib/utils.ts";
import { useInsetContext, usePanelActions } from "@/web/layouts/shell-layout";
import { useVirtualMCP, useVirtualMCPs } from "@decocms/mesh-sdk";
import { isProject } from "@/web/hooks/use-create-project";
import { IntegrationIcon } from "@/web/components/integration-icon";
import { FolderClosed, Settings02 } from "@untitledui/icons";
import { Suspense } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";

interface ToolUIEntry {
  connectionId: string;
  toolName: string;
  label: string;
  icon: string | null;
}

function useProjectToolUIs(virtualMcpId: string): ToolUIEntry[] {
  const entity = useVirtualMCP(virtualMcpId);
  const allVirtualMcps = useVirtualMCPs();

  if (!entity || !isProject(entity)) return [];

  // Collect pinned views from the project metadata
  const pinnedViews =
    ((entity.metadata?.ui as Record<string, unknown> | null | undefined)
      ?.pinnedViews as ToolUIEntry[] | null) ?? [];

  if (pinnedViews.length > 0) return pinnedViews;

  // Fallback: check if the project has a default ext-apps view
  const defaultView = (
    entity.metadata?.ui as Record<string, unknown> | null | undefined
  )?.layout as {
    defaultMainView?: { type: string; id?: string; toolName?: string };
  } | null;

  if (
    defaultView?.defaultMainView?.type === "ext-apps" &&
    defaultView.defaultMainView.id
  ) {
    const connId = defaultView.defaultMainView.id;
    const toolName = defaultView.defaultMainView.toolName ?? "";
    // Find the connection's title for the label
    const agent = allVirtualMcps.find((a) =>
      a.connections.some((c) => c.connection_id === connId),
    );
    return [
      {
        connectionId: connId,
        toolName,
        label: agent?.title ?? toolName,
        icon: agent?.icon ?? null,
      },
    ];
  }

  return [];
}

function ToolbarContent() {
  const ctx = useInsetContext();
  const { openMainView } = usePanelActions();

  if (!ctx) return null;
  const { virtualMcpId, mainView } = ctx;

  const toolUIs = useProjectToolUIs(virtualMcpId);
  const entity = useVirtualMCP(virtualMcpId);
  const entityIsProject = entity ? isProject(entity) : false;

  if (!entityIsProject) return null;

  const isSettingsActive = mainView?.type === "settings";
  const isFilesActive = mainView === null || mainView?.type === "chat";

  return (
    <div className="shrink-0 flex items-center gap-0.5 px-2 py-1.5 border-b border-border">
      {/* Files */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => openMainView("default")}
            className={cn(
              "flex items-center justify-center size-7 rounded-md transition-colors",
              isFilesActive
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <FolderClosed size={14} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Files</TooltipContent>
      </Tooltip>

      {/* Tool UI icons */}
      {toolUIs.map((tool) => {
        const isActive =
          mainView?.type === "ext-apps" &&
          mainView.id === tool.connectionId &&
          mainView.toolName === tool.toolName;

        return (
          <Tooltip key={`${tool.connectionId}-${tool.toolName}`}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() =>
                  isActive
                    ? openMainView("default")
                    : openMainView("ext-apps", {
                        id: tool.connectionId,
                        toolName: tool.toolName,
                      })
                }
                className={cn(
                  "flex items-center justify-center size-7 rounded-md transition-colors",
                  isActive
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <IntegrationIcon
                  icon={tool.icon}
                  name={tool.label}
                  size="2xs"
                  className="border-0 bg-transparent"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{tool.label}</TooltipContent>
          </Tooltip>
        );
      })}

      <div className="flex-1" />

      {/* Settings */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() =>
              isSettingsActive
                ? openMainView("default")
                : openMainView("settings")
            }
            className={cn(
              "flex items-center justify-center size-7 rounded-md transition-colors",
              isSettingsActive
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Settings02 size={14} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Settings</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function ContentToolbar() {
  return (
    <Suspense fallback={null}>
      <ToolbarContent />
    </Suspense>
  );
}

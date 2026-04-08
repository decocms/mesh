/**
 * ContentToolbar — Top bar on the main content panel.
 * Shows icons for available UI tools from the project's agents.
 * Styled to match the top bar layout toggles (size-7 ghost buttons, 16px icons).
 */

import { cn } from "@deco/ui/lib/utils.ts";
import { useInsetContext, usePanelActions } from "@/web/layouts/shell-layout";
import { useSearch } from "@tanstack/react-router";
import { useVirtualMCP, useVirtualMCPs } from "@decocms/mesh-sdk";
import { isProject } from "@/web/hooks/use-create-project";
import { AgentAvatar } from "@/web/components/agent-icon";
import { Folder, Settings02 } from "@untitledui/icons";
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

  const pinnedViews =
    ((entity.metadata?.ui as Record<string, unknown> | null | undefined)
      ?.pinnedViews as ToolUIEntry[] | null) ?? [];

  if (pinnedViews.length > 0) return pinnedViews;

  const defaultView = (
    entity.metadata?.ui as Record<string, unknown> | null | undefined
  )?.layout as {
    defaultMainView?: {
      type: string;
      id?: string;
      toolName?: string;
    };
  } | null;

  if (
    defaultView?.defaultMainView?.type === "ext-apps" &&
    defaultView.defaultMainView.id
  ) {
    const connId = defaultView.defaultMainView.id;
    const toolName = defaultView.defaultMainView.toolName ?? "";
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

/** Button style matching the top bar layout toggles */
const toolbarBtnClass =
  "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors";
const toolbarBtnActive = "bg-sidebar-accent text-sidebar-foreground";
const toolbarBtnInactive =
  "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground";

function ToolbarContent() {
  const ctx = useInsetContext();
  const { openMainView } = usePanelActions();

  if (!ctx) return null;
  const { virtualMcpId, mainView } = ctx;

  const toolUIs = useProjectToolUIs(virtualMcpId);
  const entity = useVirtualMCP(virtualMcpId);
  const entityIsProject = entity ? isProject(entity) : false;

  if (!entityIsProject) return null;

  const search = useSearch({ strict: false }) as { main?: string };
  const isSettingsActive = mainView?.type === "settings";
  const isFilesActive = search.main === "files";

  return (
    <div className="shrink-0 flex items-center gap-0.5 px-1.5 h-10 border-b border-border">
      {/* Files */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => openMainView("files")}
            className={cn(
              toolbarBtnClass,
              isFilesActive ? toolbarBtnActive : toolbarBtnInactive,
            )}
          >
            <Folder size={16} />
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
                    ? openMainView("files")
                    : openMainView("ext-apps", {
                        id: tool.connectionId,
                        toolName: tool.toolName,
                      })
                }
                className={cn(
                  toolbarBtnClass,
                  isActive ? toolbarBtnActive : toolbarBtnInactive,
                )}
              >
                <AgentAvatar
                  icon={tool.icon}
                  name={tool.label}
                  size="xs"
                  className="size-5 [&_svg]:size-3"
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
                ? openMainView("files")
                : openMainView("settings")
            }
            className={cn(
              toolbarBtnClass,
              isSettingsActive ? toolbarBtnActive : toolbarBtnInactive,
            )}
          >
            <Settings02 size={16} />
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

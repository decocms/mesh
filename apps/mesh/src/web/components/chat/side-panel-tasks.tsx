/**
 * Global Tasks Side Panel
 *
 * When inside a project: shows project name header (Cursor-style) with
 * settings, New session button, pinned Views, then tasks for that project.
 *
 * When global (no project): shows "Tasks" header, New task button, all tasks.
 */

import { Page } from "@/web/components/page";

import { useDecoChatOpen } from "@/web/hooks/use-deco-chat-open";
import {
  LayoutLeft,
  Loading01,
  MessageTextCircle02,
  Settings01,
} from "@untitledui/icons";
import { useMatch } from "@tanstack/react-router";
import { useVirtualMCPActions, useVirtualMCPs } from "@decocms/mesh-sdk";
import type { VirtualMCPEntity } from "@decocms/mesh-sdk/types";
import { Suspense, useTransition } from "react";
import { ErrorBoundary } from "../error-boundary";
import { Chat, useChat } from "./index";
import { OwnerFilter, TaskListContent } from "./tasks-panel";
import { cn } from "@deco/ui/lib/utils.ts";
import { IconPicker } from "@/web/components/icon-picker.tsx";
import { useOptionalAgentContext } from "@/web/contexts/agent-context";

// ────────────────────────────────────────
// Shared nav item style — used by New session and view buttons
// ────────────────────────────────────────

const navItemClass =
  "flex items-center gap-2.5 mx-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors w-[calc(100%-1rem)]";

function NewTaskButton({
  onClick,
  isPending,
  label = "New task",
}: {
  onClick: () => void;
  isPending: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className={cn(
        navItemClass,
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
    >
      {isPending ? (
        <Loading01 size={14} className="shrink-0 animate-spin" />
      ) : (
        <MessageTextCircle02 size={14} className="shrink-0" />
      )}
      {label}
    </button>
  );
}

// ────────────────────────────────────────
// Views section — pinned UIs for the project
// ────────────────────────────────────────

function ProjectViewsSection({ project }: { project: VirtualMCPEntity }) {
  const agentCtx = useOptionalAgentContext();

  const pinnedViews =
    ((project.metadata?.ui as Record<string, unknown> | null | undefined)
      ?.pinnedViews as Array<{
      connectionId: string;
      toolName: string;
      label: string;
      icon: string | null;
    }> | null) ?? [];

  if (pinnedViews.length === 0) return null;

  // Determine which pinned view is currently active
  const currentMain = agentCtx?.mainView;
  const isExtAppActive = (view: { connectionId: string; toolName: string }) =>
    currentMain?.type === "ext-apps" &&
    currentMain.id === view.connectionId &&
    currentMain.toolName === view.toolName;

  return (
    <>
      {pinnedViews.map((view) => (
        <button
          key={`${view.connectionId}-${view.toolName}`}
          type="button"
          onClick={() =>
            agentCtx?.navigateToMain("ext-apps", {
              id: view.connectionId,
              toolName: view.toolName,
            })
          }
          className={cn(
            navItemClass,
            isExtAppActive(view) && "bg-accent text-foreground",
          )}
        >
          {view.icon ? (
            <img src={view.icon} alt="" className="size-4 rounded shrink-0" />
          ) : (
            <LayoutLeft size={15} className="shrink-0" />
          )}
          <span className="truncate">{view.label || view.toolName}</span>
        </button>
      ))}
    </>
  );
}

// ────────────────────────────────────────
// Space identity header — inline-editable name, description, icon, pin
// ────────────────────────────────────────

function SpaceIdentityHeader({ project }: { project: VirtualMCPEntity }) {
  const actions = useVirtualMCPActions();

  const handleTitleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    if (value && value !== project.title) {
      actions.update.mutate({ id: project.id, data: { title: value } });
    }
  };

  const handleDescriptionBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value !== (project.description ?? "")) {
      actions.update.mutate({
        id: project.id,
        data: { description: value },
      });
    }
  };

  const handleIconChange = (icon: string | null) => {
    actions.update.mutate({ id: project.id, data: { icon } });
  };

  const handleColorChange = (color: string) => {
    actions.update.mutate({
      id: project.id,
      data: {
        metadata: {
          ...project.metadata,
          ui: {
            ...(project.metadata?.ui as Record<string, unknown> | undefined),
            themeColor: color,
          },
        },
      },
    });
  };

  return (
    <div
      key={`${project.id}-${project.updated_at}`}
      className="flex items-center gap-3 px-4 pt-4 pb-2"
    >
      <IconPicker
        value={project.icon}
        onChange={handleIconChange}
        onColorChange={handleColorChange}
        name={project.title || "Space"}
        size="sm"
        className="shrink-0 self-center"
      />
      <div className="flex flex-col flex-1 min-w-0">
        <input
          type="text"
          defaultValue={project.title}
          onBlur={handleTitleBlur}
          placeholder="Space Name"
          className="text-sm font-medium text-foreground bg-transparent border-none outline-none px-1 -mx-1 rounded hover:bg-input/25 focus:bg-input/25 transition-colors w-full truncate"
        />
        <input
          type="text"
          defaultValue={project.description ?? ""}
          onBlur={handleDescriptionBlur}
          placeholder="Add a description..."
          className="text-sm text-muted-foreground bg-transparent border-none outline-none px-1 -mx-1 rounded hover:bg-input/25 focus:bg-input/25 transition-colors w-full truncate"
        />
      </div>
    </div>
  );
}

// ────────────────────────────────────────
// Panel content
// ────────────────────────────────────────

function TasksPanelContent({
  virtualMcpId: virtualMcpIdProp,
}: {
  virtualMcpId?: string;
}) {
  const [, setChatOpen] = useDecoChatOpen();
  const { createTask, switchToTask, setVirtualMcpId } = useChat();
  const agentCtx = useOptionalAgentContext();
  const [isPending, startTransition] = useTransition();

  const agentsMatch = useMatch({
    from: "/shell/$org/agents/$virtualMcpId",
    shouldThrow: false,
  });
  const virtualMcpId =
    virtualMcpIdProp ?? agentsMatch?.params.virtualMcpId ?? null;

  const allAgents = useVirtualMCPs();
  const project = virtualMcpId
    ? (allAgents.find((s) => s.id === virtualMcpId) ?? null)
    : null;

  const handleNewTask = () => {
    startTransition(() => {
      if (project) {
        setVirtualMcpId(project.id);
      }
      createTask();
      setChatOpen(true);
    });
  };

  const isSettingsActive =
    agentCtx?.mainView?.type === "settings" ||
    (agentCtx && agentCtx.mainView === null);

  return (
    <div className="flex flex-col h-full">
      {/* Space identity */}
      {project && <SpaceIdentityHeader project={project} />}

      {/* Header */}
      {!project && (
        <Page.Header className="flex-none" hideSidebarTrigger>
          <Page.Header.Left className="gap-2">
            <span className="text-sm font-medium text-foreground">Tasks</span>
          </Page.Header.Left>
          <Page.Header.Right className="gap-1">
            <OwnerFilter />
          </Page.Header.Right>
        </Page.Header>
      )}

      {/* Nav items: New session + Settings + Views flow as one group */}
      <div className="py-2 flex flex-col gap-0.5">
        <NewTaskButton
          onClick={handleNewTask}
          isPending={isPending}
          label="New task"
        />
        {project && (
          <button
            type="button"
            onClick={() => agentCtx?.navigateToMain("settings")}
            className={cn(
              navItemClass,
              isSettingsActive && "bg-accent text-foreground",
            )}
          >
            <Settings01 size={14} className="shrink-0" />
            Settings
          </button>
        )}
        {project && <ProjectViewsSection project={project} />}
      </div>

      {/* Task list */}
      <TaskListContent
        virtualMcpId={virtualMcpId}
        onTaskSelect={(taskId) => {
          switchToTask(taskId);
          setChatOpen(true);
        }}
      />
    </div>
  );
}

export function TasksSidePanel({ virtualMcpId }: { virtualMcpId?: string }) {
  return (
    <ErrorBoundary fallback={<Chat.Skeleton />}>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Loading01
              size={16}
              className="animate-spin text-muted-foreground"
            />
          </div>
        }
      >
        <TasksPanelContent virtualMcpId={virtualMcpId} />
      </Suspense>
    </ErrorBoundary>
  );
}

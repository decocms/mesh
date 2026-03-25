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
import { useDecoTasksOpen } from "@/web/hooks/use-deco-tasks-open";
import {
  LayoutLeft,
  Loading01,
  MessageTextCircle02,
  Settings01,
  X,
} from "@untitledui/icons";
import { useMatch, useNavigate, useRouterState } from "@tanstack/react-router";
import { useProjectContext, useVirtualMCPs } from "@decocms/mesh-sdk";
import type { VirtualMCPEntity } from "@decocms/mesh-sdk/types";
import { Suspense, useTransition } from "react";
import { ErrorBoundary } from "../error-boundary";
import { Chat, useChat } from "./index";
import { OwnerFilter, TaskListContent } from "./tasks-panel";
import { cn } from "@deco/ui/lib/utils.ts";

// ────────────────────────────────────────
// Project header — shown when inside a project
// ────────────────────────────────────────

function ProjectHeader({
  project,
  org,
  onClose,
}: {
  project: VirtualMCPEntity;
  org: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-2.5 pl-4 pr-2 py-5 flex-none">
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        <span className="text-sm font-semibold text-foreground truncate leading-tight">
          {project.title}
        </span>
        {project.description && (
          <span className="text-xs text-muted-foreground truncate leading-tight">
            {project.description}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() =>
          navigate({
            to: "/$org/projects/$virtualMcpId/settings",
            params: { org, virtualMcpId: project.id },
          })
        }
        className="flex size-6 items-center justify-center rounded-md hover:bg-accent transition-colors shrink-0"
        title="Project settings"
      >
        <Settings01 size={14} className="text-muted-foreground" />
      </button>
      <button
        type="button"
        onClick={onClose}
        className="flex size-6 items-center justify-center rounded-md hover:bg-accent transition-colors shrink-0"
        title="Close panel"
      >
        <X size={14} className="text-muted-foreground" />
      </button>
    </div>
  );
}

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

function ProjectViewsSection({
  project,
  org,
}: {
  project: VirtualMCPEntity;
  org: string;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const pinnedViews =
    ((project.metadata?.ui as Record<string, unknown> | null | undefined)
      ?.pinnedViews as Array<{
      connectionId: string;
      toolName: string;
      label: string;
      icon: string | null;
    }> | null) ?? [];

  if (pinnedViews.length === 0) return null;

  return (
    <>
      {pinnedViews.map((view) => {
        const viewPath = `/${org}/projects/${project.id}/apps/${view.connectionId}/${encodeURIComponent(view.toolName)}`;
        const isActive = pathname.startsWith(viewPath);
        return (
          <button
            key={`${view.connectionId}-${view.toolName}`}
            type="button"
            onClick={() =>
              navigate({
                to: "/$org/projects/$virtualMcpId/apps/$connectionId/$toolName",
                params: {
                  org,
                  virtualMcpId: project.id,
                  connectionId: view.connectionId,
                  toolName: view.toolName,
                },
              })
            }
            className={cn(
              navItemClass,
              isActive && "bg-accent text-foreground",
            )}
          >
            {view.icon ? (
              <img src={view.icon} alt="" className="size-4 rounded shrink-0" />
            ) : (
              <LayoutLeft size={15} className="shrink-0" />
            )}
            <span className="truncate">{view.label || view.toolName}</span>
          </button>
        );
      })}
    </>
  );
}

// ────────────────────────────────────────
// Panel content
// ────────────────────────────────────────

function TasksPanelContent() {
  const [, setTasksOpen] = useDecoTasksOpen();
  const [, setChatOpen] = useDecoChatOpen();
  const { createTask, switchToTask, setVirtualMcpId } = useChat();
  const { org } = useProjectContext();
  const [isPending, startTransition] = useTransition();

  const spacesMatch = useMatch({
    from: "/shell/$org/spaces/$virtualMcpId",
    shouldThrow: false,
  });
  const projectsMatch = useMatch({
    from: "/shell/$org/projects/$virtualMcpId",
    shouldThrow: false,
  });
  const virtualMcpId =
    (spacesMatch ?? projectsMatch)?.params.virtualMcpId ?? null;

  const allSpaces = useVirtualMCPs();
  const project = virtualMcpId
    ? (allSpaces.find((s) => s.id === virtualMcpId) ?? null)
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      {project ? (
        <ProjectHeader
          project={project}
          org={org.slug}
          onClose={() => setTasksOpen(false)}
        />
      ) : (
        <Page.Header className="flex-none" hideSidebarTrigger>
          <Page.Header.Left className="gap-2">
            <span className="text-sm font-medium text-foreground">Tasks</span>
          </Page.Header.Left>
          <Page.Header.Right className="gap-1">
            <OwnerFilter />
            <button
              type="button"
              onClick={() => setTasksOpen(false)}
              className="flex size-10 md:size-6 items-center justify-center rounded-full p-1 outline-none focus-visible:ring-0 hover:bg-transparent transition-colors group cursor-pointer"
              title="Close tasks"
            >
              <X
                size={16}
                className="text-muted-foreground group-hover:text-foreground transition-colors"
              />
            </button>
          </Page.Header.Right>
        </Page.Header>
      )}

      {/* Nav items: New session + Views flow as one group */}
      <div className="py-2 flex flex-col gap-0.5">
        <NewTaskButton
          onClick={handleNewTask}
          isPending={isPending}
          label="New task"
        />
        {project && <ProjectViewsSection project={project} org={org.slug} />}
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

export function TasksSidePanel() {
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
        <TasksPanelContent />
      </Suspense>
    </ErrorBoundary>
  );
}

/**
 * Global Tasks Side Panel
 *
 * Unified task list — always shows all tasks across all projects,
 * labeled by project name. Optionally filterable.
 */

import { usePanelActions } from "@/web/layouts/shell-layout";
import { Edit05, Loading01 } from "@untitledui/icons";
import {
  useVirtualMCPs,
  isDecopilot as isDecopilotFn,
} from "@decocms/mesh-sdk";
import { Suspense, useTransition } from "react";
import { isMac } from "@/web/lib/keyboard-shortcuts";
import { ErrorBoundary } from "../error-boundary";
import { Chat } from "./index";
import { OwnerFilter, TaskListContent } from "./tasks-panel";
import { cn } from "@deco/ui/lib/utils.ts";
import { Skeleton } from "@deco/ui/components/skeleton.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";

// ────────────────────────────────────────
// Shared nav item style — used by New session and view buttons
// ────────────────────────────────────────

const navItemClass =
  "flex items-center gap-2.5 mx-2 px-3 h-10 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground w-[calc(100%-1rem)]";

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
    <Tooltip delayDuration={600}>
      <TooltipTrigger asChild>
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
            <Loading01 size={16} className="shrink-0 animate-spin" />
          ) : (
            <Edit05 size={16} className="shrink-0" />
          )}
          <span className="text-foreground">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-1.5">
        New task
        <span className="flex items-center gap-0.5">
          {(isMac ? ["⇧", "⌘", "S"] : ["⇧", "Ctrl", "S"]).map((key) => (
            <kbd
              key={key}
              className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-sm border border-white/20 bg-white/10 text-white/70 text-xs font-mono"
            >
              {key}
            </kbd>
          ))}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

// ────────────────────────────────────────
// Panel content
// ────────────────────────────────────────

function TasksPanelContent({
  virtualMcpId: _virtualMcpIdProp,
  hideProjectHeader: _hideProjectHeader,
  showAutomations,
}: {
  virtualMcpId?: string;
  hideProjectHeader?: boolean;
  showAutomations?: boolean;
}) {
  const { createNewTask, setTaskId } = usePanelActions();
  const [isPending, startTransition] = useTransition();

  // Always show ALL tasks — unified panel regardless of context
  const allProjects = useVirtualMCPs();
  const projectNames = new Map(
    allProjects
      .filter((p) => p.id && !isDecopilotFn(p.id))
      .map((p) => [p.id, p.title]),
  );

  const handleNewTask = () => {
    startTransition(() => {
      createNewTask();
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-1">
        <span className="text-sm font-medium text-foreground flex-1">
          Tasks
        </span>
        <OwnerFilter />
      </div>

      {/* New task */}
      <div className="py-1 flex flex-col gap-0.5">
        <NewTaskButton
          onClick={handleNewTask}
          isPending={isPending}
          label="New task"
        />
      </div>

      {/* Task list — always all tasks, labeled by project */}
      <TaskListContent
        virtualMcpId=""
        showAutomations={showAutomations}
        onTaskCreate={handleNewTask}
        onTaskSelect={(taskId) => {
          setTaskId(taskId);
        }}
        projectNames={projectNames}
      />
    </div>
  );
}

function TasksPanelSkeleton() {
  return (
    <div className="flex flex-col h-full animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center gap-3 pl-3 pr-4 pt-3 pb-3">
        <Skeleton className="size-10 rounded-xl shrink-0" />
        <div className="flex flex-col flex-1 min-w-0 gap-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>

      {/* Nav items skeleton */}
      <div className="py-2 flex flex-col gap-0.5 mx-2">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <Skeleton className="size-3.5 rounded shrink-0" />
          <Skeleton className="h-3.5 w-16" />
        </div>
        <div className="flex items-center gap-2.5 px-3 py-2">
          <Skeleton className="size-3.5 rounded shrink-0" />
          <Skeleton className="h-3.5 w-14" />
        </div>
      </div>

      {/* Task rows skeleton */}
      <div className="flex flex-col gap-1 px-4 pt-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-1.5 py-2">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TasksSidePanel({
  virtualMcpId,
  hideProjectHeader,
  showAutomations,
}: {
  virtualMcpId?: string;
  hideProjectHeader?: boolean;
  showAutomations?: boolean;
}) {
  return (
    <ErrorBoundary fallback={<Chat.Skeleton />}>
      <Suspense fallback={<TasksPanelSkeleton />}>
        <TasksPanelContent
          virtualMcpId={virtualMcpId}
          hideProjectHeader={hideProjectHeader}
          showAutomations={showAutomations}
        />
      </Suspense>
    </ErrorBoundary>
  );
}

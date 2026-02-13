/**
 * Tasks Panel & Task List Components
 *
 * Shared task list UI used in both:
 * - Home page: persistent TasksPanel sidebar (left side)
 * - Other pages: TaskListContent inside the chat panel overlay
 *
 * Design matches /tasks/ page exactly, just compact in width.
 */

import { useChat } from "@/web/components/chat/index";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { User } from "@/web/components/user/user.tsx";
import { formatTimeAgo } from "@/web/lib/format-time";
import { KEYS } from "@/web/lib/query-keys";
import type { ThreadEntity } from "@/tools/thread/schema";
import type { CollectionListOutput } from "@decocms/bindings/collections";
import {
  SELF_MCP_ALIAS_ID,
  useMCPClient,
  useProjectContext,
} from "@decocms/mesh-sdk";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  CheckCircle,
  ChevronRight,
  Hourglass03,
  Loading01,
  Placeholder,
  Plus,
  XCircle,
} from "@untitledui/icons";
import { Suspense, useRef, useState } from "react";
import { ErrorBoundary } from "../error-boundary";

// --- Status config ---

const STATUS_ORDER = [
  "in_progress",
  "requires_action",
  "failed",
  "expired",
  "completed",
] as const;

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof Loading01; iconClassName: string }
> = {
  in_progress: {
    label: "In Progress",
    icon: Loading01,
    iconClassName: "text-muted-foreground animate-spin",
  },
  requires_action: {
    label: "Need Action",
    icon: Placeholder,
    iconClassName: "text-orange-500",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    iconClassName: "text-destructive",
  },
  expired: {
    label: "Timed Out",
    icon: Hourglass03,
    iconClassName: "text-warning",
  },
  completed: {
    label: "Complete",
    icon: CheckCircle,
    iconClassName: "text-success",
  },
};

function groupByStatus(tasks: ThreadEntity[]) {
  const groups: Record<string, ThreadEntity[]> = {};
  for (const task of tasks) {
    const status = task.status ?? "completed";
    if (!groups[status]) groups[status] = [];
    groups[status].push(task);
  }
  for (const group of Object.values(groups)) {
    group.sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );
  }
  return groups;
}

// --- Truncated text with tooltip ---

function TruncatedText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <Tooltip
      open={open}
      onOpenChange={(isOpen) => {
        if (isOpen && ref.current) {
          setOpen(ref.current.scrollWidth > ref.current.clientWidth);
        } else {
          setOpen(false);
        }
      }}
    >
      <TooltipTrigger asChild>
        <span ref={ref} className={cn("truncate block", className)}>
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

// --- Shared task list content ---

function useTaskData() {
  const { org, locator } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });

  return useSuspenseQuery({
    queryKey: KEYS.taskThreads(locator),
    queryFn: async () => {
      if (!client) throw new Error("MCP client is not available");
      const result = (await client.callTool({
        name: "COLLECTION_THREADS_LIST",
        arguments: { limit: 100, offset: 0 },
      })) as { structuredContent?: unknown };
      const payload = (result.structuredContent ??
        result) as CollectionListOutput<ThreadEntity>;
      return payload.items ?? [];
    },
    staleTime: 30_000,
  });
}

interface TaskListContentProps {
  /** Called when a task is selected (defaults to switchToThread from chat context) */
  onTaskSelect?: (taskId: string) => void;
}

/**
 * TaskListContent - The core task list with search + status-grouped tasks.
 * Self-contained: fetches its own data, uses chat context for active thread.
 * Used in both the home TasksPanel and the chat panel overlay.
 *
 * Design matches the /tasks/ page StatusGroup exactly, just without
 * the description column and wide spacer (compact width).
 */
export function TaskListContent({ onTaskSelect }: TaskListContentProps) {
  const { activeThreadId, switchToThread } = useChat();
  const { data } = useTaskData();

  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});

  const visible = data.filter((t) => !t.hidden);

  const searched = searchQuery.trim()
    ? visible.filter((t) =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : visible;

  const groups = groupByStatus(searched);
  const activeStatuses = STATUS_ORDER.filter(
    (s) => groups[s] && groups[s].length > 0,
  );

  const toggleGroup = (status: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [status]: !prev[status] }));
  };

  const handleTaskClick = async (task: ThreadEntity) => {
    if (onTaskSelect) {
      onTaskSelect(task.id);
    } else {
      await switchToThread(task.id);
    }
  };

  return (
    <>
      <CollectionSearch
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search tasks..."
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setSearchQuery("");
            (e.target as HTMLInputElement).blur();
          }
        }}
      />

      <div className="flex-1 overflow-y-auto">
        {searched.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 px-4 text-center">
            <p className="text-xs text-muted-foreground">
              {searchQuery ? "No tasks found" : "No tasks yet"}
            </p>
          </div>
        ) : (
          activeStatuses.map((status, idx) => {
            const config = STATUS_CONFIG[status];
            if (!config) return null;
            const Icon = config.icon;
            const tasks = groups[status] ?? [];
            const isOpen = !collapsedGroups[status];

            return (
              <div key={status} className="flex flex-col">
                {/* Group header — same as /tasks/ page */}
                <button
                  type="button"
                  onClick={() => toggleGroup(status)}
                  className={cn(
                    "flex items-center w-full bg-[rgba(245,245,245,0.3)] border-b border-border/50 dark:bg-[rgba(30,30,30,0.3)]",
                    idx !== 0 && "border-t border-border/50",
                  )}
                >
                  <div className="flex items-center justify-center w-9 shrink-0 px-3">
                    <ChevronRight
                      size={16}
                      className={cn(
                        "text-muted-foreground transition-transform duration-200",
                        isOpen && "rotate-90",
                      )}
                    />
                  </div>
                  <div className="flex items-center gap-3 flex-1 py-3">
                    <Icon size={16} className={config.iconClassName} />
                    <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                      {config.label}
                    </span>
                    <span className="text-xs text-muted-foreground/60">
                      {tasks.length}
                    </span>
                  </div>
                </button>

                {/* Task rows — same as /tasks/ page, minus description column */}
                {isOpen &&
                  tasks.map((task) => {
                    const isActive = task.id === activeThreadId;
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => handleTaskClick(task)}
                        className={cn(
                          "flex items-center w-full hover:bg-accent/50 transition-colors cursor-pointer text-left",
                          isActive && "bg-accent/50",
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0 py-3 pl-4 flex-1">
                          <Icon
                            size={16}
                            className={cn("shrink-0", config.iconClassName)}
                          />
                          <TruncatedText
                            text={task.title || "Untitled"}
                            className="text-sm font-medium text-foreground flex-1 min-w-0"
                          />
                        </div>
                        <div className="flex items-center gap-2 p-3 shrink-0">
                          <User id={task.created_by} size="3xs" avatarOnly />
                        </div>
                        <div className="p-3 shrink-0 text-right">
                          <span className="text-sm text-muted-foreground whitespace-nowrap">
                            {task.updated_at
                              ? formatTimeAgo(new Date(task.updated_at))
                              : "\u2014"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

// --- Home page panel wrapper ---

function TasksPanelContent() {
  const { createThread, isChatEmpty } = useChat();

  return (
    <div className="flex flex-col h-full bg-background border-r border-border">
      {/* Header */}
      <div className="h-12 px-4 flex items-center justify-between shrink-0 border-b border-border">
        <span className="text-sm font-normal text-foreground">Tasks</span>
        <button
          type="button"
          onClick={() => createThread()}
          disabled={isChatEmpty}
          className="flex size-7 items-center justify-center rounded-md hover:bg-accent transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title="New chat"
        >
          <Plus size={16} className="text-muted-foreground" />
        </button>
      </div>

      <TaskListContent />
    </div>
  );
}

function TasksPanelSkeleton() {
  return (
    <div className="flex flex-col h-full bg-background border-r border-border">
      <div className="h-12 px-4 flex items-center shrink-0 border-b border-border">
        <span className="text-sm font-normal text-foreground">Tasks</span>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <Loading01 size={20} className="animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}

export function TasksPanel({ className }: { className?: string }) {
  return (
    <div className={cn("w-[280px] shrink-0 h-full", className)}>
      <ErrorBoundary
        fallback={() => (
          <div className="flex flex-col h-full bg-background border-r border-border">
            <div className="h-12 px-4 flex items-center shrink-0 border-b border-border">
              <span className="text-sm font-normal text-foreground">Tasks</span>
            </div>
            <div className="flex-1 flex items-center justify-center px-4 text-center">
              <p className="text-xs text-muted-foreground">
                Unable to load tasks
              </p>
            </div>
          </div>
        )}
      >
        <Suspense fallback={<TasksPanelSkeleton />}>
          <TasksPanelContent />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}

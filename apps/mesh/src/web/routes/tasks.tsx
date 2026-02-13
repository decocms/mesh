import { useChat } from "@/web/components/chat";
import { CollectionSearch } from "@/web/components/collections/collection-search.tsx";
import { EmptyState } from "@/web/components/empty-state.tsx";
import { ErrorBoundary } from "@/web/components/error-boundary";
import { Page } from "@/web/components/page";
import { User } from "@/web/components/user/user.tsx";
import { useListState } from "@/web/hooks/use-list-state";
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
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@deco/ui/components/breadcrumb.tsx";
import {
  CheckDone01,
  Loading01,
  CheckCircle,
  XCircle,
  Placeholder,
  Hourglass03,
  ChevronRight,
} from "@untitledui/icons";
import { cn } from "@deco/ui/lib/utils.ts";
import { useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";

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

// --- Components ---

function StatusGroup({
  status,
  tasks,
  isOpen,
  onToggle,
  onRowClick,
  isFirst,
}: {
  status: string;
  tasks: ThreadEntity[];
  isOpen: boolean;
  onToggle: () => void;
  onRowClick: (task: ThreadEntity) => void;
  isFirst: boolean;
}) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;
  const Icon = config.icon;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex items-center w-full bg-[rgba(245,245,245,0.3)] border-b border-border/50 dark:bg-[rgba(30,30,30,0.3)]",
          !isFirst && "border-t border-border/50",
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
        </div>
      </button>

      {isOpen &&
        tasks.map((task) => (
          <button
            key={task.id}
            type="button"
            onClick={() => onRowClick(task)}
            className="flex items-center w-full hover:bg-accent/50 transition-colors cursor-pointer text-left"
          >
            <div className="w-[46px] shrink-0" />
            <div className="flex items-center gap-3 min-w-0 py-3 pl-2 w-[40%] shrink-0">
              <Icon
                size={16}
                className={cn("shrink-0", config.iconClassName)}
              />
              <span className="text-sm font-medium text-foreground truncate">
                {task.title}
              </span>
            </div>
            <div className="flex-1 min-w-0 py-3">
              {task.description && (
                <span className="text-sm text-muted-foreground truncate block">
                  {task.description}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 p-3 shrink-0">
              <User id={task.created_by} size="3xs" />
            </div>
            <div className="w-20 p-3 shrink-0 text-right">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {task.updated_at
                  ? formatTimeAgo(new Date(task.updated_at))
                  : "\u2014"}
              </span>
            </div>
          </button>
        ))}
    </div>
  );
}

function TasksContent() {
  const { org, project, locator } = useProjectContext();
  const client = useMCPClient({
    connectionId: SELF_MCP_ALIAS_ID,
    orgId: org.id,
  });
  const navigate = useNavigate();
  const { switchToThread } = useChat();

  const listState = useListState({
    namespace: org.slug,
    resource: "tasks",
    defaultSortKey: "updated_at",
    defaultViewMode: "table",
  });

  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});

  const { data } = useSuspenseQuery({
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

  const visible = data.filter((t) => !t.hidden);

  const searched = listState.searchTerm
    ? visible.filter((t) =>
        t.title.toLowerCase().includes(listState.searchTerm.toLowerCase()),
      )
    : visible;

  const groups = groupByStatus(searched);
  const activeStatuses = STATUS_ORDER.filter(
    (s) => groups[s] && groups[s].length > 0,
  );

  const onRowClick = async (thread: ThreadEntity) => {
    await switchToThread(thread.id);
    navigate({
      to: "/$org/$project",
      params: { org: org.slug, project: project.slug },
    });
  };

  const toggleGroup = (status: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [status]: !prev[status] }));
  };

  return (
    <Page>
      <Page.Header>
        <Page.Header.Left>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Tasks</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </Page.Header.Left>
      </Page.Header>

      <CollectionSearch
        value={listState.search}
        onChange={listState.setSearch}
        placeholder="Search for a task..."
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            listState.setSearch("");
            (event.target as HTMLInputElement).blur();
          }
        }}
      />

      <Page.Content>
        <div className="h-full flex flex-col overflow-auto">
          {searched.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              {listState.search ? (
                <EmptyState
                  image={
                    <CheckDone01 size={36} className="text-muted-foreground" />
                  }
                  title="No tasks found"
                  description={`No tasks match "${listState.search}"`}
                />
              ) : (
                <EmptyState
                  image={
                    <div className="flex items-center justify-center w-16 h-16 rounded-full bg-muted">
                      <CheckDone01
                        size={32}
                        className="text-muted-foreground"
                      />
                    </div>
                  }
                  title="No tasks yet"
                  description="Tasks will appear here when agents start processing work."
                />
              )}
            </div>
          ) : (
            activeStatuses.map((status, idx) => (
              <StatusGroup
                key={status}
                status={status}
                tasks={groups[status] ?? []}
                isOpen={!collapsedGroups[status]}
                onToggle={() => toggleGroup(status)}
                onRowClick={onRowClick}
                isFirst={idx === 0}
              />
            ))
          )}
        </div>
      </Page.Content>
    </Page>
  );
}

export default function TasksPage() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Loading01
              size={32}
              className="animate-spin text-muted-foreground"
            />
          </div>
        }
      >
        <TasksContent />
      </Suspense>
    </ErrorBoundary>
  );
}

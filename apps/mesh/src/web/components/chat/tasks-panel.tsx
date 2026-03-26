/**
 * Tasks Panel — Sidebar + Compact List
 *
 * Status-grouped list with 3 sections: Needs input, In progress, Done.
 * Dense, scannable rows. Collapsible groups with counts.
 */

import { useChat } from "@/web/components/chat/index";
import { CollectionSearch } from "@/web/components/collections/collection-search";
import { useChatStable } from "@/web/components/chat/context";
import { useOptionalAgentContext } from "@/web/contexts/agent-context";
import { AgentAvatar } from "@/web/components/agent-icon";
import { formatTimeAgo, formatTimeUntil } from "@/web/lib/format-time";
import {
  buildDisplayGroups,
  getTaskVerb,
  STATUS_CONFIG,
  type StatusKey,
} from "@/web/lib/task-status";
import type { Task } from "./task/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  getWellKnownDecopilotVirtualMCP,
  useConnections,
  useProjectContext,
} from "@decocms/mesh-sdk";
import {
  CheckDone01,
  ChevronRight,
  FilterLines,
  Loading01,
  Plus,
  RefreshCcw01,
  SearchMd,
  X,
} from "@untitledui/icons";
import { useRef, useState } from "react";
import { User as UserIcon, Users as UsersIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.js";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@deco/ui/components/context-menu.tsx";
import type { TaskOwnerFilter } from "./task";
import { useChatStore } from "./store/selectors";
import {
  useAutomationsList,
  useAutomationCreate,
  buildDefaultAutomationInput,
  type AutomationListItem,
} from "@/web/hooks/use-automations";

// ────────────────────────────────────────

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

export function OwnerFilter() {
  const { ownerFilter, setOwnerFilter, isFilterChangePending } =
    useChatStable();

  const isFiltered = ownerFilter === "me";
  const Icon = isFilterChangePending
    ? Loading01
    : isFiltered
      ? UserIcon
      : UsersIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex size-7 shrink-0 items-center justify-center rounded-md transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
          title={isFiltered ? "My tasks" : "All tasks"}
          disabled={isFilterChangePending}
        >
          <Icon
            size={16}
            className={cn(isFilterChangePending && "animate-spin")}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={ownerFilter}
          onValueChange={(v) => setOwnerFilter(v as TaskOwnerFilter)}
        >
          <DropdownMenuRadioItem value="me">My tasks</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="everyone">
            All tasks
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ────────────────────────────────────────
// Multi-agent avatar stack
// ────────────────────────────────────────

// ────────────────────────────────────────
// Group header
// ────────────────────────────────────────

function GroupHeader({
  label,
  icon: Icon,
  iconClassName,
  count,
  isOpen,
  onToggle,
}: {
  label: string;
  icon: typeof Loading01;
  iconClassName: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="group flex items-center gap-1.5 px-4 py-3 w-full hover:bg-accent/30 transition-colors cursor-pointer"
    >
      <Icon size={14} className={iconClassName} />
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {!isOpen && (
        <span className="text-xs text-muted-foreground/60 tabular-nums">
          {count}
        </span>
      )}
      <ChevronRight
        size={12}
        className={cn(
          "text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-all duration-150",
          isOpen && "rotate-90",
        )}
      />
    </button>
  );
}

// ────────────────────────────────────────
// Task row
// ────────────────────────────────────────

function TaskRow({
  task,
  isActive,
  connectionMap,
  defaultAgent,
  onClick,
}: {
  task: Task;
  isActive: boolean;
  connectionMap: Map<
    string,
    { icon: string | null | undefined; title: string }
  >;
  defaultAgent: { icon: string | null | undefined; title: string };
  onClick: () => void;
}) {
  const { setTaskStatus, hideTask } = useChatStable();
  const status = task.status;
  const cachedMessages = useChatStore((s) => s.threadMessages[task.id]);
  const taskVerb = getTaskVerb(task, cachedMessages);

  const agentIds = task.agent_ids ?? [];
  const firstAgentId = agentIds[0];
  const primaryAgent =
    firstAgentId !== undefined
      ? (() => {
          const conn = connectionMap.get(firstAgentId);
          return conn ? { icon: conn.icon, title: conn.title } : defaultAgent;
        })()
      : defaultAgent;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "group/row relative flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors",
            isActive ? "bg-accent" : "hover:bg-accent/50",
          )}
          onClick={onClick}
        >
          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Line 1: Title + time */}
            <div className="flex items-center gap-1.5">
              <TruncatedText
                text={task.title || "Untitled"}
                className="text-sm text-foreground flex-1 min-w-0"
              />
              <span className="text-xs text-muted-foreground tabular-nums shrink-0 whitespace-nowrap opacity-100 group-hover/row:opacity-0 transition-opacity">
                {task.updated_at
                  ? formatTimeAgo(new Date(task.updated_at))
                  : ""}
              </span>
            </div>
            {/* Line 2: agent name · status verb (only when actionable) */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="truncate">{primaryAgent.title}</span>
              {taskVerb && (
                <>
                  <span>·</span>
                  <span className={cn("shrink-0", taskVerb.labelColor)}>
                    {taskVerb.verb}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Mark done button — shown on hover for non-completed tasks */}
          {status !== "completed" && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 size-6 flex items-center justify-center rounded-md hover:bg-accent transition-opacity opacity-0 group-hover/row:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                void setTaskStatus(task.id, "completed");
              }}
              title="Mark as done"
            >
              <CheckDone01 size={14} className="text-muted-foreground" />
            </button>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuSub>
          <ContextMenuSubTrigger>Set status</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <ContextMenuItem
                  key={key}
                  className={cn("gap-2", status === key && "font-medium")}
                  onSelect={() => void setTaskStatus(task.id, key)}
                >
                  <Icon size={14} className={cfg.iconClassName} />
                  <span>{cfg.label}</span>
                  {status === key && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      current
                    </span>
                  )}
                </ContextMenuItem>
              );
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onSelect={() => hideTask(task.id)}
        >
          Archive
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// ────────────────────────────────────────
// Automation row
// ────────────────────────────────────────

function AutomationRow({
  automation,
  onClick,
}: {
  automation: AutomationListItem;
  onClick: () => void;
}) {
  const nextRun = automation.nearest_next_run_at;

  return (
    <div
      className="group/row relative flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-accent/50"
      onClick={onClick}
    >
      <div className={cn("flex-1 min-w-0", !automation.active && "opacity-50")}>
        <div className="flex items-center gap-1.5">
          <TruncatedText
            text={automation.name || "Untitled"}
            className="text-sm text-foreground flex-1 min-w-0"
          />
          <span className="text-xs text-muted-foreground tabular-nums shrink-0 whitespace-nowrap">
            {!automation.active
              ? ""
              : automation.trigger_count === 0
                ? ""
                : nextRun
                  ? formatTimeUntil(new Date(nextRun))
                  : `${automation.trigger_count} starter${automation.trigger_count > 1 ? "s" : ""}`}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="shrink-0">
            {!automation.active
              ? "Disabled"
              : automation.trigger_count === 0
                ? "No starters"
                : nextRun
                  ? "Scheduled"
                  : `${automation.trigger_count} event starter${automation.trigger_count > 1 ? "s" : ""}`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────
// Incoming section (automations)
// ────────────────────────────────────────

function IncomingSection({ virtualMcpId }: { virtualMcpId: string }) {
  const agentCtx = useOptionalAgentContext();
  const { data: allAutomations } = useAutomationsList();
  const createMutation = useAutomationCreate();
  const [isOpen, setIsOpen] = useState(false);

  const automations = (allAutomations ?? [])
    .filter((a) => a.agent?.id === virtualMcpId)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

  const navigateToAutomation = (automationId?: string) => {
    console.log("[navigateToAutomation]", {
      automationId,
      hasSpaceCtx: !!agentCtx,
      virtualMcpId,
      currentUrl: window.location.href,
    });
    if (automationId) {
      agentCtx?.navigateToMain("automation", { id: automationId });
    } else {
      agentCtx?.navigateToMain("default");
    }
  };

  const handleCreate = async () => {
    try {
      const result = await createMutation.mutateAsync(
        buildDefaultAutomationInput(virtualMcpId),
      );
      navigateToAutomation(result.id);
    } catch {
      // silently fail — the mutation hook handles cache invalidation
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="group/incoming flex items-center gap-1.5 px-4 py-3 w-full hover:bg-accent/30 transition-colors cursor-pointer"
      >
        <RefreshCcw01 size={14} className="text-purple-500" />
        <span className="text-sm font-medium text-muted-foreground">
          Incoming
        </span>
        {!isOpen && (
          <span className="text-xs text-muted-foreground/60 tabular-nums">
            {automations.length}
          </span>
        )}
        <ChevronRight
          size={12}
          className={cn(
            "text-muted-foreground/40 opacity-0 group-hover/incoming:opacity-100 transition-all duration-150",
            isOpen && "rotate-90",
          )}
        />
        <span className="flex-1" />
        <span
          role="button"
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md transition-all text-muted-foreground hover:bg-accent hover:text-foreground",
            createMutation.isPending
              ? "opacity-100"
              : "opacity-0 group-hover/incoming:opacity-100",
          )}
          onClick={(e) => {
            e.stopPropagation();
            handleCreate();
          }}
          title="Create automation"
        >
          {createMutation.isPending ? (
            <Loading01 size={16} className="animate-spin" />
          ) : (
            <Plus size={16} />
          )}
        </span>
      </button>
      {isOpen &&
        automations.map((automation) => (
          <AutomationRow
            key={automation.id}
            automation={automation}
            onClick={() => {
              console.log("[AutomationRow click]", {
                automationId: automation.id,
                automationName: automation.name,
              });
              navigateToAutomation(automation.id);
            }}
          />
        ))}
    </div>
  );
}

// ────────────────────────────────────────
// Filter dropdown
// ────────────────────────────────────────

function FilterDropdown({
  statusFilter,
  agentFilter,
  availableAgents,
  connectionMap,
  defaultAgent,
  onStatusChange,
  onAgentChange,
}: {
  statusFilter: Set<StatusKey>;
  agentFilter: Set<string>;
  availableAgents: string[];
  connectionMap: Map<
    string,
    { icon: string | null | undefined; title: string }
  >;
  defaultAgent: { icon: string | null | undefined; title: string };
  onStatusChange: (status: StatusKey) => void;
  onAgentChange: (agentId: string) => void;
}) {
  const hasFilters = statusFilter.size > 0 || agentFilter.size > 0;
  const showAgents = availableAgents.length > 1;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
            hasFilters
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          title="Filter"
        >
          <FilterLines size={16} />
          {hasFilters && (
            <span className="absolute top-1 right-1 size-1.5 rounded-full bg-blue-500" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Status
        </DropdownMenuLabel>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <DropdownMenuCheckboxItem
              key={key}
              checked={statusFilter.has(key as StatusKey)}
              onCheckedChange={() => onStatusChange(key as StatusKey)}
            >
              <Icon size={12} className={cfg.iconClassName} />
              {cfg.label}
            </DropdownMenuCheckboxItem>
          );
        })}
        {showAgents && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Agent
            </DropdownMenuLabel>
            {availableAgents.map((agentId) => {
              const conn = connectionMap.get(agentId);
              const agent = conn ?? defaultAgent;
              return (
                <DropdownMenuCheckboxItem
                  key={agentId}
                  checked={agentFilter.has(agentId)}
                  onCheckedChange={() => onAgentChange(agentId)}
                >
                  <AgentAvatar icon={agent.icon} name={agent.title} size="xs" />
                  <span className="truncate">{agent.title}</span>
                </DropdownMenuCheckboxItem>
              );
            })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ────────────────────────────────────────
// Core list (sidebar + side-panel)
// ────────────────────────────────────────

interface TaskListContentProps {
  onTaskSelect?: (taskId: string) => void;
  virtualMcpId?: string | null;
}

export function TaskListContent({
  onTaskSelect,
  virtualMcpId,
}: TaskListContentProps) {
  const { activeTaskId, switchToTask } = useChat();
  const { tasks, virtualMcps } = useChatStable();
  const { org } = useProjectContext();

  // Compute needed agent IDs from tasks
  const agentIds = [
    ...new Set(
      tasks.filter((t) => !t.hidden).flatMap((t) => t.agent_ids ?? []),
    ),
  ];

  const connections = useConnections({
    additionalToolArgs:
      agentIds.length > 0
        ? { where: { field: ["id"], operator: "in", value: agentIds } }
        : undefined,
  });
  // Build a unified agent lookup: connections + virtual MCPs
  const connectionMap = new Map<
    string,
    { icon: string | null | undefined; title: string }
  >();
  for (const c of connections) {
    connectionMap.set(c.id, { icon: c.icon, title: c.title });
  }
  for (const v of virtualMcps) {
    if (v.id) connectionMap.set(v.id, { icon: v.icon, title: v.title });
  }

  const defaultAgent = getWellKnownDecopilotVirtualMCP(org.id);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Set<StatusKey>>(new Set());
  const [agentFilter, setAgentFilter] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const visible = tasks.filter((t) => !t.hidden);

  // When inside a space, show only tasks that involve this space's agent
  const spaceId = virtualMcpId ?? null;
  const spaceFiltered = spaceId
    ? visible.filter((t) => t.agent_ids?.includes(spaceId))
    : visible;

  const availableAgents = [
    ...new Set(spaceFiltered.flatMap((t) => t.agent_ids ?? [])),
  ];

  const searched = searchQuery.trim()
    ? spaceFiltered.filter((t) =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : spaceFiltered;

  const filtered = searched.filter((task) => {
    if (
      statusFilter.size > 0 &&
      !statusFilter.has((task.status ?? "completed") as StatusKey)
    )
      return false;
    if (agentFilter.size > 0) {
      const taskAgents = task.agent_ids ?? [];
      if (!taskAgents.some((id) => agentFilter.has(id))) return false;
    }
    return true;
  });

  const groups = buildDisplayGroups(filtered);

  const toggleGroup = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelect = async (task: Task) => {
    if (onTaskSelect) {
      onTaskSelect(task.id);
    } else {
      await switchToTask(task.id);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Tasks header + search/filter */}
      {searchOpen ? (
        <div className="flex items-center">
          <div className="flex-1 min-w-0">
            <CollectionSearch
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search tasks..."
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchQuery("");
                  setSearchOpen(false);
                }
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSearchOpen(false);
            }}
            className="flex size-7 shrink-0 items-center justify-center rounded-md transition-colors text-muted-foreground hover:bg-accent hover:text-foreground mr-2"
            title="Close search"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="px-2 py-1 flex items-center gap-0.5 min-h-[36px]">
          <span className="flex-1 text-xs font-medium text-muted-foreground px-2">
            Tasks
          </span>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
              searchQuery
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            title="Search tasks"
          >
            <SearchMd size={16} />
          </button>
          <FilterDropdown
            statusFilter={statusFilter}
            agentFilter={agentFilter}
            availableAgents={availableAgents}
            connectionMap={connectionMap}
            defaultAgent={defaultAgent}
            onStatusChange={(s) =>
              setStatusFilter((prev) => {
                const next = new Set(prev);
                if (next.has(s)) next.delete(s);
                else next.add(s);
                return next;
              })
            }
            onAgentChange={(a) =>
              setAgentFilter((prev) => {
                const next = new Set(prev);
                if (next.has(a)) next.delete(a);
                else next.add(a);
                return next;
              })
            }
          />
        </div>
      )}

      {/* Grouped list */}
      <div className="flex-1 overflow-y-auto">
        {groups
          .filter((g) => g.key !== "done")
          .map((group) => {
            const isGroupOpen = !!expanded[group.key];
            return (
              <div key={group.key}>
                <GroupHeader
                  label={group.label}
                  icon={group.icon}
                  iconClassName={group.iconClassName}
                  count={group.tasks.length}
                  isOpen={isGroupOpen}
                  onToggle={() => toggleGroup(group.key)}
                />
                {isGroupOpen &&
                  group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      isActive={task.id === activeTaskId}
                      connectionMap={connectionMap}
                      defaultAgent={defaultAgent}
                      onClick={() => handleSelect(task)}
                    />
                  ))}
              </div>
            );
          })}
        {virtualMcpId && <IncomingSection virtualMcpId={virtualMcpId} />}
        {groups
          .filter((g) => g.key === "done")
          .map((group) => {
            const isGroupOpen = !!expanded[group.key];
            return (
              <div key={group.key}>
                <GroupHeader
                  label={group.label}
                  icon={group.icon}
                  iconClassName={group.iconClassName}
                  count={group.tasks.length}
                  isOpen={isGroupOpen}
                  onToggle={() => toggleGroup(group.key)}
                />
                {isGroupOpen &&
                  group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      isActive={task.id === activeTaskId}
                      connectionMap={connectionMap}
                      defaultAgent={defaultAgent}
                      onClick={() => handleSelect(task)}
                    />
                  ))}
              </div>
            );
          })}
      </div>
    </div>
  );
}

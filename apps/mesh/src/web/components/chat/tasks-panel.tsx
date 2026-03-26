/**
 * Tasks Panel — Sidebar + Compact List
 *
 * Status-grouped list with 3 sections: Needs input, In progress, Done.
 * Dense, scannable rows. Collapsible groups with counts.
 */

import { useChat } from "@/web/components/chat/index";
import { useChatStable } from "@/web/components/chat/context";
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
  CheckDone02,
  ChevronRight,
  FilterLines,
  Loading01,
  Archive,
  Plus,
  RefreshCcw01,
  SearchMd,
  X,
} from "@untitledui/icons";
import { EmptyState } from "@/web/components/empty-state.tsx";
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
  useAutomationUpdate,
  buildDefaultAutomationInput,
  type AutomationListItem,
} from "@/web/hooks/use-automations";
import { Switch } from "@deco/ui/components/switch.tsx";
import { useNavigate, useMatch } from "@tanstack/react-router";

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
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
            isFilterChangePending || isFiltered
              ? "text-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          title={isFiltered ? "My tasks" : "All tasks"}
          disabled={isFilterChangePending}
        >
          <Icon
            size={14}
            className={isFilterChangePending ? "animate-spin" : ""}
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

function AgentAvatarStack({
  agentIds,
  connectionMap,
  defaultAgent,
}: {
  agentIds: string[];
  connectionMap: Map<
    string,
    { icon: string | null | undefined; title: string }
  >;
  defaultAgent: { icon: string | null | undefined; title: string };
}) {
  const display =
    agentIds.length > 0
      ? agentIds.slice(0, 2).map((id) => {
          const conn = connectionMap.get(id);
          return conn ? { icon: conn.icon, title: conn.title } : defaultAgent;
        })
      : [defaultAgent];

  const extra = Math.max(0, agentIds.length - 2);

  const total = display.length + (extra > 0 ? 1 : 0);

  return (
    <div className="flex shrink-0">
      {display.map((agent, i) => (
        <div
          key={i}
          style={{ zIndex: total - i }}
          className={cn(
            "ring-1 ring-background rounded-md transition-all duration-150 ease-out",
            i > 0 && "-ml-[20px] group-hover/row:-ml-1",
          )}
        >
          <AgentAvatar icon={agent.icon} name={agent.title} size="xs" />
        </div>
      ))}
      {extra > 0 && (
        <div
          style={{ zIndex: 0 }}
          className={cn(
            "flex items-center justify-center size-6 rounded-md bg-muted text-[9px] font-medium text-muted-foreground ring-1 ring-background transition-all duration-150 ease-out",
            "-ml-[20px] group-hover/row:-ml-1",
          )}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}

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
          {/* Agent avatar stack */}
          <div className="shrink-0">
            <AgentAvatarStack
              agentIds={agentIds}
              connectionMap={connectionMap}
              defaultAgent={defaultAgent}
            />
          </div>

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

          {/* Archive button — shown on hover */}
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 size-6 flex items-center justify-center rounded-md hover:bg-accent transition-opacity opacity-0 group-hover/row:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              hideTask(task.id);
            }}
            title="Archive"
          >
            <Archive size={14} className="text-muted-foreground" />
          </button>
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
  connectionMap,
  defaultAgent,
  onClick,
  onToggleActive,
}: {
  automation: AutomationListItem;
  connectionMap: Map<
    string,
    { icon: string | null | undefined; title: string }
  >;
  defaultAgent: { icon: string | null | undefined; title: string };
  onClick: () => void;
  onToggleActive: (id: string, active: boolean) => void;
}) {
  const agentId = automation.agent?.id;
  const agent = agentId
    ? (connectionMap.get(agentId) ?? defaultAgent)
    : defaultAgent;
  const nextRun = automation.nearest_next_run_at;

  return (
    <div
      className="group/row relative flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-accent/50"
      onClick={onClick}
    >
      <div className={cn("shrink-0", !automation.active && "opacity-50")}>
        <AgentAvatar icon={agent.icon} name={agent.title} size="xs" />
      </div>
      <div className={cn("flex-1 min-w-0", !automation.active && "opacity-50")}>
        <div className="flex items-center gap-1.5">
          <TruncatedText
            text={automation.name || "Untitled"}
            className="text-sm text-foreground flex-1 min-w-0"
          />
          <span className="text-xs text-muted-foreground tabular-nums shrink-0 whitespace-nowrap">
            {nextRun ? formatTimeUntil(new Date(nextRun)) : "Event"}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="truncate">{agent.title}</span>
          <span>·</span>
          <span className="shrink-0">
            {nextRun ? "Scheduled" : "Event-based"}
          </span>
        </div>
      </div>
      <div
        className="shrink-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Switch
          checked={automation.active}
          onCheckedChange={(checked) => onToggleActive(automation.id, checked)}
          className="cursor-pointer scale-75"
        />
      </div>
    </div>
  );
}

// ────────────────────────────────────────
// Incoming section (automations)
// ────────────────────────────────────────

function IncomingSection({
  virtualMcpId,
  connectionMap,
  defaultAgent,
}: {
  virtualMcpId: string;
  connectionMap: Map<
    string,
    { icon: string | null | undefined; title: string }
  >;
  defaultAgent: { icon: string | null | undefined; title: string };
}) {
  const { org } = useProjectContext();
  const navigate = useNavigate();
  const { data: allAutomations } = useAutomationsList();
  const createMutation = useAutomationCreate();
  const updateMutation = useAutomationUpdate();
  const [isOpen, setIsOpen] = useState(true);

  const spacesMatch = useMatch({
    from: "/shell/$org/spaces/$virtualMcpId",
    shouldThrow: false,
  });

  const automations = (allAutomations ?? [])
    .filter((a) => a.agent?.id === virtualMcpId)
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

  const navigateToAutomation = (automationId?: string) => {
    const routeBase = spacesMatch
      ? "/shell/$org/spaces/$virtualMcpId/automations"
      : "/shell/$org/projects/$virtualMcpId/automations";
    navigate({
      to: routeBase,
      params: { org: org.slug, virtualMcpId },
      search: automationId ? { automationId } : {},
    });
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
      <div className="flex items-center">
        <div className="flex-1 min-w-0">
          <GroupHeader
            label="Incoming"
            icon={RefreshCcw01}
            iconClassName="text-purple-500"
            count={automations.length}
            isOpen={isOpen}
            onToggle={() => setIsOpen((prev) => !prev)}
          />
        </div>
        <button
          type="button"
          className="flex size-7 shrink-0 items-center justify-center rounded-md transition-colors text-muted-foreground hover:bg-accent hover:text-foreground mr-2"
          onClick={handleCreate}
          disabled={createMutation.isPending}
          title="Create automation"
        >
          {createMutation.isPending ? (
            <Loading01
              size={14}
              className="animate-spin text-muted-foreground"
            />
          ) : (
            <Plus size={14} className="text-muted-foreground" />
          )}
        </button>
      </div>
      {isOpen &&
        automations.map((automation) => (
          <AutomationRow
            key={automation.id}
            automation={automation}
            connectionMap={connectionMap}
            defaultAgent={defaultAgent}
            onClick={() => navigateToAutomation(automation.id)}
            onToggleActive={(id, active) =>
              updateMutation.mutate({ id, active })
            }
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
          className="relative flex size-7 shrink-0 items-center justify-center rounded-md transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Filter"
        >
          <FilterLines
            size={14}
            className={cn(
              hasFilters ? "text-foreground" : "text-muted-foreground/50",
            )}
          />
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
  const [statusFilter, setStatusFilter] = useState<Set<StatusKey>>(new Set());
  const [agentFilter, setAgentFilter] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
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
      <div className="px-2 py-1 flex items-center gap-1 min-h-[36px]">
        <span className="text-xs font-medium text-muted-foreground px-2 shrink-0">
          Tasks
        </span>
        <div className="flex-1 relative">
          <SearchMd
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 pointer-events-none"
          />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            onKeyDown={(e) => {
              if (e.key === "Escape") setSearchQuery("");
            }}
            className="w-full h-7 pl-7 pr-2 text-sm bg-transparent rounded-md border-0 outline-none placeholder:text-muted-foreground/30 focus:bg-accent transition-colors"
          />
        </div>
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="flex size-7 shrink-0 items-center justify-center rounded-md transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Clear search"
          >
            <X size={14} />
          </button>
        )}
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

      {/* Grouped list */}
      <div className="flex-1 overflow-y-auto">
        {virtualMcpId && (
          <IncomingSection
            virtualMcpId={virtualMcpId}
            connectionMap={connectionMap}
            defaultAgent={defaultAgent}
          />
        )}
        {groups.length === 0 ? (
          <EmptyState
            image={
              <CheckDone02 size={40} className="text-muted-foreground/40" />
            }
            title={
              searchQuery || statusFilter.size > 0 || agentFilter.size > 0
                ? "No matches"
                : "No tasks yet"
            }
            description={
              searchQuery || statusFilter.size > 0 || agentFilter.size > 0
                ? "No tasks match the current filters"
                : "Tasks appear here as agents work."
            }
            className="py-12"
          />
        ) : (
          <div className="flex flex-col gap-1">
            {groups.map((group) => {
              const isGroupOpen = !collapsed[group.key];
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
        )}
      </div>
    </div>
  );
}

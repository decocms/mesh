import { Edit05, FilterLines, User02, Users03 } from "@untitledui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import { cn } from "@deco/ui/lib/utils.js";
import type { Task } from "@/web/components/chat/task/types";
import { TaskRow } from "./task-row";

export type FilterOption = "all" | "manual" | "automation";
export type MemberFilter = "all" | "mine";

const FILTER_LABELS: Record<FilterOption, string> = {
  all: "All tasks",
  manual: "Chats",
  automation: "Automation",
};

const MEMBER_FILTER_LABELS: Record<MemberFilter, string> = {
  all: "All members",
  mine: "Mine only",
};

export function TasksSection({
  title,
  tasks,
  activeTaskId,
  onSelect,
  onArchive,
  onNew,
  showNewButton,
  showAutomationBadge,
  emptyLabel,
  filter,
  setFilter,
  memberFilter,
  setMemberFilter,
}: {
  title: string;
  tasks: Task[];
  activeTaskId: string | null;
  onSelect: (task: Task) => void;
  onArchive: (task: Task) => void;
  onNew?: () => void;
  showNewButton?: boolean;
  showAutomationBadge?: boolean;
  emptyLabel?: string;
  filter: FilterOption;
  setFilter: (v: FilterOption) => void;
  memberFilter: MemberFilter;
  setMemberFilter: (v: MemberFilter) => void;
}) {
  const visibleTasks = tasks;

  return (
    <div className="flex flex-col gap-0.5 mt-1">
      <div className="pl-2 pr-1.5 h-7 flex items-center justify-between text-xs font-medium text-muted-foreground mb-1">
        <span>{title}</span>
        <div className="flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Filter by member"
                className="flex size-8 items-center justify-center rounded-md hover:bg-muted hover:text-foreground"
              >
                {memberFilter === "mine" ? (
                  <User02 size={16} />
                ) : (
                  <Users03 size={16} />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={memberFilter}
                onValueChange={(v) => setMemberFilter(v as MemberFilter)}
              >
                {(Object.keys(MEMBER_FILTER_LABELS) as MemberFilter[]).map(
                  (opt) => (
                    <DropdownMenuRadioItem key={opt} value={opt}>
                      {MEMBER_FILTER_LABELS[opt]}
                    </DropdownMenuRadioItem>
                  ),
                )}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Filter tasks"
                className={cn(
                  "flex size-8 items-center justify-center rounded-md hover:bg-muted hover:text-foreground",
                  filter !== "all" && "text-purple-500",
                )}
              >
                <FilterLines size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={filter}
                onValueChange={(v) => setFilter(v as FilterOption)}
              >
                {(Object.keys(FILTER_LABELS) as FilterOption[]).map((opt) => (
                  <DropdownMenuRadioItem key={opt} value={opt}>
                    {FILTER_LABELS[opt]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {showNewButton && onNew && (
            <button
              type="button"
              onClick={onNew}
              aria-label={`New ${title.toLowerCase()}`}
              className="flex size-8 items-center justify-center rounded-md hover:bg-muted hover:text-foreground"
            >
              <Edit05 size={16} />
            </button>
          )}
        </div>
      </div>
      {visibleTasks.length === 0 && emptyLabel ? (
        <div className="px-2 py-1.5 text-xs text-muted-foreground/70">
          {emptyLabel}
        </div>
      ) : (
        visibleTasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            isActive={activeTaskId === t.id}
            onClick={() => onSelect(t)}
            onArchive={() => onArchive(t)}
            showAutomationBadge={showAutomationBadge || t.fromAutomation}
          />
        ))
      )}
    </div>
  );
}

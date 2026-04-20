import { Plus } from "@untitledui/icons";
import type { Task } from "@/web/components/chat/task/types";
import { TaskRow } from "./task-row";

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
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-2 h-7 flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>{title}</span>
        {showNewButton && onNew && (
          <button
            type="button"
            onClick={onNew}
            aria-label={`New ${title.toLowerCase()}`}
            className="flex size-5 items-center justify-center rounded-md hover:bg-muted hover:text-foreground"
          >
            <Plus size={12} />
          </button>
        )}
      </div>
      {tasks.length === 0 && emptyLabel ? (
        <div className="px-2 py-1.5 text-xs text-muted-foreground/70">
          {emptyLabel}
        </div>
      ) : (
        tasks.map((t) => (
          <TaskRow
            key={t.id}
            task={t}
            isActive={activeTaskId === t.id}
            onClick={() => onSelect(t)}
            onArchive={() => onArchive(t)}
            showAutomationBadge={showAutomationBadge}
          />
        ))
      )}
    </div>
  );
}

import { Plus } from "@untitledui/icons";
import type { Task } from "@/web/components/chat/task/types";
import { TaskRow } from "./task-row";

export function TasksSection({
  tasks,
  activeTaskId,
  onSelect,
  onArchive,
  onNew,
}: {
  tasks: Task[];
  activeTaskId: string | null;
  onSelect: (task: Task) => void;
  onArchive: (task: Task) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-2 h-7 flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span>Tasks</span>
        <button
          type="button"
          onClick={onNew}
          aria-label="New task"
          className="flex size-5 items-center justify-center rounded-md hover:bg-muted hover:text-foreground"
        >
          <Plus size={12} />
        </button>
      </div>
      {tasks.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          isActive={activeTaskId === t.id}
          onClick={() => onSelect(t)}
          onArchive={() => onArchive(t)}
        />
      ))}
    </div>
  );
}

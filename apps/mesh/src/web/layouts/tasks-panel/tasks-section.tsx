import type { Task } from "@/web/components/chat/task/types";
import { TaskRow } from "./task-row";

export function TasksSection({
  tasks,
  activeTaskId,
  onSelect,
  onArchive,
}: {
  tasks: Task[];
  activeTaskId: string | null;
  onSelect: (task: Task) => void;
  onArchive: (task: Task) => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-2 h-7 flex items-center text-xs font-medium text-muted-foreground">
        Tasks
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

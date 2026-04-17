import { cn } from "@deco/ui/lib/utils.js";
import { Archive } from "@untitledui/icons";
import { McpAvatar } from "./mcp-avatar";
import { statusVerb } from "./status-verb";
import type { Task } from "@/web/components/chat/task/types";

export function TaskRow({
  task,
  isActive,
  onClick,
  onArchive,
}: {
  task: Task;
  isActive: boolean;
  onClick: () => void;
  onArchive: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      className={cn(
        "group/row flex items-center gap-3 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
        isActive ? "bg-accent" : "hover:bg-accent/60",
      )}
    >
      <McpAvatar virtualMcpId={task.virtual_mcp_id} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground truncate">
          {task.title || "Untitled task"}
        </div>
        <div className="text-xs text-muted-foreground truncate group-hover/row:hidden">
          {statusVerb(task)}
        </div>
      </div>
      <button
        type="button"
        aria-label="Archive task"
        onClick={(e) => {
          e.stopPropagation();
          onArchive();
        }}
        className="hidden group-hover/row:flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
      >
        <Archive size={14} />
      </button>
    </div>
  );
}

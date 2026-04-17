import { cn } from "@deco/ui/lib/utils.js";
import { Archive } from "@untitledui/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { McpAvatar } from "./mcp-avatar";
import { getStatusConfig } from "@/web/lib/task-status";
import { formatTimeAgo } from "@/web/lib/format-time";
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
  const config = getStatusConfig(task.status);
  const StatusIcon = config.icon;

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
        {task.updated_at && (
          <div className="text-xs text-muted-foreground truncate">
            {formatTimeAgo(new Date(task.updated_at))}
          </div>
        )}
      </div>
      <div className="shrink-0 grid [grid-template-areas:'slot'] items-center justify-items-center">
        <span
          className="[grid-area:slot] flex size-7 items-center justify-center group-hover/row:invisible"
          aria-label={config.label}
        >
          <StatusIcon
            size={14}
            className={cn(
              config.iconClassName,
              task.status === "in_progress" && "animate-spin",
            )}
          />
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Archive task"
              onClick={(e) => {
                e.stopPropagation();
                onArchive();
              }}
              className="[grid-area:slot] invisible group-hover/row:visible flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Archive size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Archive</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

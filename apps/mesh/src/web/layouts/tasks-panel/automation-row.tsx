import { cn } from "@deco/ui/lib/utils.js";
import { McpAvatar } from "./mcp-avatar";
import type { AutomationListItem } from "@/web/hooks/use-automations";

export function AutomationRow({
  automation,
  isActive,
  onClick,
}: {
  automation: AutomationListItem;
  isActive: boolean;
  onClick: () => void;
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
        "flex items-center gap-3 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
        isActive ? "bg-accent" : "hover:bg-accent/60",
      )}
    >
      <McpAvatar virtualMcpId={automation.agent?.id ?? null} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground truncate">
          {automation.name}
        </div>
        {automation.nearest_next_run_at && (
          <div className="text-xs text-muted-foreground truncate">
            Next run {new Date(automation.nearest_next_run_at).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

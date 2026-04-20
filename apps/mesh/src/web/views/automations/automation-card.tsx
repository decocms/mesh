import { cn } from "@deco/ui/lib/utils.js";
import { Card } from "@deco/ui/components/card.tsx";
import { Clock, Zap } from "@untitledui/icons";
import { AgentAvatar } from "@/web/components/agent-icon";
import { useVirtualMCP } from "@decocms/mesh-sdk";
import type { AutomationListItem } from "@/web/hooks/use-automations";

export function AutomationCard({
  automation,
  showAgent,
  onClick,
}: {
  automation: AutomationListItem;
  showAgent?: boolean;
  onClick: () => void;
}) {
  const agent = useVirtualMCP(automation.agent?.id ?? undefined);

  return (
    <Card
      onClick={onClick}
      className="relative transition-colors group overflow-hidden flex flex-col h-full hover:bg-muted/50 cursor-pointer"
    >
      <div className="flex flex-col gap-3 p-4.5">
        {showAgent && agent && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            <AgentAvatar
              icon={agent.icon ?? null}
              name={agent.title}
              size="xs"
              className="shrink-0"
            />
            <span className="truncate">{agent.title}</span>
          </div>
        )}

        <div className="flex flex-col gap-1 min-w-0">
          <h3 className="text-sm font-medium text-foreground truncate">
            {automation.name}
          </h3>
          <TriggerSummary
            triggerCount={automation.trigger_count}
            nextRunAt={automation.nearest_next_run_at}
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "inline-block size-1.5 rounded-full",
              automation.active ? "bg-emerald-500" : "bg-muted-foreground/40",
            )}
          />
          <span className="text-muted-foreground">
            {automation.active ? "Active" : "Paused"}
          </span>
        </div>
      </div>
    </Card>
  );
}

function TriggerSummary({
  triggerCount,
  nextRunAt,
}: {
  triggerCount: number;
  nextRunAt: string | null;
}) {
  if (triggerCount === 0) {
    return (
      <p className="text-sm text-muted-foreground">No triggers configured</p>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
      {nextRunAt ? (
        <>
          <Clock size={12} className="shrink-0" />
          <span className="truncate">
            Next run {new Date(nextRunAt).toLocaleString()}
          </span>
        </>
      ) : (
        <>
          <Zap size={12} className="shrink-0" />
          <span className="truncate">
            {triggerCount} trigger{triggerCount === 1 ? "" : "s"}
          </span>
        </>
      )}
    </div>
  );
}

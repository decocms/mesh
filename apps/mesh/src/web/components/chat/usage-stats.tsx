import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@deco/ui/components/tooltip.tsx";
import { Icon } from "@deco/ui/components/icon.tsx";
import { Metadata } from "@deco/ui/types/chat-metadata.ts";
import { calculateUsageStats } from "@/web/lib/usage-utils.ts";

interface UsageStatsProps {
  messages: Array<{ metadata?: Metadata }>;
}

export function UsageStats({ messages }: UsageStatsProps) {
  const usage = calculateUsageStats(messages);
  if (!usage) return null;
  const { totalTokens, inputTokens, outputTokens, cost } = usage;
  if (!totalTokens && !inputTokens && !outputTokens) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="ml-auto shrink-0 flex items-center gap-1 text-[11px] text-muted-foreground/60 font-mono tabular-nums hover:text-muted-foreground transition-colors"
        >
          <Icon name="token" size={12} className="opacity-60" />
          <span className="hidden md:inline">
            {totalTokens.toLocaleString()}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="font-mono text-[11px]">
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <span className="text-muted">in</span>
          <span>{inputTokens.toLocaleString()}</span>
          <span className="text-muted">out</span>
          <span>{outputTokens.toLocaleString()}</span>
          {cost > 0 && (
            <>
              <span className="text-muted">cost</span>
              <span>${cost.toFixed(4)}</span>
            </>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@deco/ui/components/tooltip.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Coins01 } from "@untitledui/icons";
import type { Metadata } from "./types.ts";
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
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground pl-1! h-6 gap-1 whitespace-nowrap shrink-0"
        >
          <Coins01 size={12} />
          <span className="text-[10px] font-mono tabular-nums">
            {totalTokens.toLocaleString()}
          </span>
        </Button>
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

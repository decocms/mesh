import { cn } from "@deco/ui/lib/utils.ts";
import type { AgentSuggestion } from "../lib/types";

interface HireAgentCtaProps {
  suggestion: AgentSuggestion;
}

const PRIORITY_STYLES = {
  high: "from-primary/20 to-primary/5 border-primary/30",
  medium: "from-amber-500/15 to-amber-500/5 border-amber-500/25",
  low: "from-muted/30 to-muted/10 border-border",
} as const;

export default function HireAgentCta({ suggestion }: HireAgentCtaProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-gradient-to-r p-4",
        PRIORITY_STYLES[suggestion.priority],
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-foreground">
            {suggestion.agentName}
          </h4>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {suggestion.reason}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 inline-flex items-center h-8 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/80 transition-colors"
        >
          Hire Agent
        </button>
      </div>
    </div>
  );
}

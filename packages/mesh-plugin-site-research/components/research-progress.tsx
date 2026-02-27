import { cn } from "@deco/ui/lib/utils.ts";
import {
  AlertTriangle,
  CheckCircle,
  Loading01,
  MinusCircle,
  XCircle,
} from "@untitledui/icons";
import type { StepState } from "../lib/types";
import { RESEARCH_STEPS } from "../lib/steps";

interface ResearchProgressProps {
  stepStates: StepState[];
  onViewReport?: () => void;
}

function StepIcon({ status }: { status: StepState["status"] }) {
  switch (status) {
    case "done":
      return <CheckCircle size={18} className="text-emerald-500" />;
    case "running":
      return <Loading01 size={18} className="text-primary animate-spin" />;
    case "failed":
      return <XCircle size={18} className="text-destructive" />;
    case "skipped":
      return <MinusCircle size={18} className="text-muted-foreground" />;
    default:
      return (
        <div className="size-[18px] rounded-full border-2 border-border" />
      );
  }
}

export default function ResearchProgress({
  stepStates,
  onViewReport,
}: ResearchProgressProps) {
  // Merge step definitions with runtime states
  const allSteps = RESEARCH_STEPS.map((def) => {
    const state = stepStates.find((s) => s.id === def.id);
    return {
      id: def.id,
      label: def.label,
      optional: def.optional ?? false,
      status: state?.status ?? ("pending" as const),
      error: state?.error,
      startedAt: state?.startedAt,
      completedAt: state?.completedAt,
    };
  });

  // Add the report synthesis step if present
  const reportState = stepStates.find((s) => s.id === "report");
  if (reportState) {
    allSteps.push({
      id: "report",
      label: "Synthesizing report",
      optional: false,
      status: reportState.status,
      error: reportState.error,
      startedAt: reportState.startedAt,
      completedAt: reportState.completedAt,
    });
  }

  const reportDone = reportState?.status === "done";

  return (
    <div className="flex flex-col gap-1">
      {allSteps.map((step) => (
        <div
          key={step.id}
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
            step.status === "running" && "bg-accent/50",
            step.status === "done" && "opacity-80",
            step.status === "pending" && "opacity-50",
          )}
        >
          <StepIcon status={step.status} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {step.label}
              </span>
              {step.optional && (
                <span className="text-xs text-muted-foreground">
                  (optional)
                </span>
              )}
            </div>
            {step.error && (
              <div className="flex items-center gap-1 mt-1">
                <AlertTriangle
                  size={12}
                  className="text-destructive shrink-0"
                />
                <span className="text-xs text-destructive truncate">
                  {step.error}
                </span>
              </div>
            )}
          </div>
          {step.startedAt && step.completedAt && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatDuration(step.startedAt, step.completedAt)}
            </span>
          )}
        </div>
      ))}

      {reportDone && onViewReport && (
        <button
          type="button"
          onClick={onViewReport}
          className="mt-4 w-full py-2 text-sm font-medium text-primary hover:underline"
        >
          View Report
        </button>
      )}
    </div>
  );
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

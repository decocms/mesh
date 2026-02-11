import { Badge } from "@deco/ui/components/badge.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { Card } from "@deco/ui/components/card.tsx";
import { useTestRuns } from "../hooks/use-test-runs";

function statusBadgeClass(status: string): string {
  switch (status) {
    case "running":
      return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    case "completed":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    case "failed":
      return "bg-red-500/10 text-red-600 border-red-500/20";
    case "cancelled":
      return "bg-zinc-500/10 text-zinc-500 border-zinc-500/20";
    case "pending":
      return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    default:
      return "";
  }
}

function formatDuration(
  startedAt: string | null,
  finishedAt: string | null,
): string | null {
  if (!startedAt) return null;
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const start = new Date(startedAt).getTime();
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function passRate(run: { passed_items: number; tested_items: number }): string {
  if (!run.tested_items) return "-";
  return `${Math.round((run.passed_items / run.tested_items) * 100)}%`;
}

export function TestRunHistory({
  selectedRunId,
  onSelectRun,
}: {
  selectedRunId?: string;
  onSelectRun: (runId: string) => void;
}) {
  const query = useTestRuns();
  const runs = query.data?.items ?? [];

  return (
    <Card className="p-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Run History</h3>
          <Button size="sm" variant="outline" onClick={() => query.refetch()}>
            Refresh
          </Button>
        </div>
        <div className="space-y-2 max-h-[520px] overflow-auto">
          {runs.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No runs yet. Start a test from the Dashboard tab.
            </p>
          )}
          {runs.map((run) => {
            const duration = formatDuration(run.started_at, run.finished_at);
            const rate = passRate(run);
            const isSelected = selectedRunId === run.id;
            return (
              <button
                type="button"
                key={run.id}
                onClick={() => onSelectRun(run.id)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      {new Date(run.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge
                    className={`capitalize ${statusBadgeClass(run.status)}`}
                  >
                    {run.status}
                  </Badge>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs flex-wrap">
                  <span className="text-muted-foreground">
                    {run.tested_items}/{run.total_items} tested
                  </span>
                  <span className="text-emerald-600 font-medium">
                    {run.passed_items} passed
                  </span>
                  {run.failed_items > 0 && (
                    <span className="text-red-600 font-medium">
                      {run.failed_items} failed
                    </span>
                  )}
                  {run.skipped_items > 0 && (
                    <span className="text-muted-foreground">
                      {run.skipped_items} skipped
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    pass rate: {rate}
                  </span>
                  {duration && (
                    <span className="text-muted-foreground">{duration}</span>
                  )}
                </div>
                {run.config_snapshot && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[9px]">
                      {run.config_snapshot.testMode.replace("_", " ")}
                    </Badge>
                    {run.config_snapshot.onFailure !== "none" && (
                      <Badge
                        variant="outline"
                        className="text-[9px] text-red-600"
                      >
                        on fail:{" "}
                        {run.config_snapshot.onFailure.replace(/_/g, " ")}
                      </Badge>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

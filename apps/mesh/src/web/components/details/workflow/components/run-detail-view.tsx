import { ScrollArea } from "@deco/ui/components/scroll-area.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import { usePollingWorkflowExecution } from "../hooks/use-workflow-collection-item";
import { Spinner } from "@deco/ui/components/spinner.tsx";
import { CheckCircle, Clock, Loader2, XCircle } from "lucide-react";
import { cn } from "@deco/ui/lib/utils.ts";

interface RunDetailViewProps {
  runId: string;
}

const ExecutionStatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case "success":
      return <CheckCircle className="w-4 h-4 text-success" />;
    case "running":
      return <Loader2 className="w-4 h-4 animate-spin text-warning" />;
    case "error":
      return <XCircle className="w-4 h-4 text-destructive" />;
    case "enqueued":
      return <Clock className="w-4 h-4 text-muted-foreground" />;
    default:
      return null;
  }
};

const StatusBadge = ({ status }: { status: string }) => {
  const variants: Record<string, string> = {
    success: "bg-success/10 text-success border-success/30",
    running: "bg-warning/10 text-warning border-warning/30",
    error: "bg-destructive/10 text-destructive border-destructive/30",
    enqueued: "bg-muted text-muted-foreground border-border",
  };

  return (
    <Badge
      variant="outline"
      className={cn("capitalize", variants[status] ?? variants.enqueued)}
    >
      {status}
    </Badge>
  );
};

export function RunDetailView({ runId }: RunDetailViewProps) {
  const { item: execution, step_results, isLoading } =
    usePollingWorkflowExecution(runId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Run not found
      </div>
    );
  }

  const startTime = execution.start_at_epoch_ms
    ? new Date(execution.start_at_epoch_ms).toLocaleString()
    : "Not started";
  const endTime = execution.completed_at_epoch_ms
    ? new Date(execution.completed_at_epoch_ms).toLocaleString()
    : execution.status === "running"
      ? "Running..."
      : "—";
  const duration =
    execution.start_at_epoch_ms && execution.completed_at_epoch_ms
      ? `${((execution.completed_at_epoch_ms - execution.start_at_epoch_ms) / 1000).toFixed(2)}s`
      : execution.status === "running"
        ? "Running..."
        : "—";

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        {/* Status Overview */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ExecutionStatusIcon status={execution.status} />
            <StatusBadge status={execution.status} />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Started</span>
              <p className="font-medium">{startTime}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Completed</span>
              <p className="font-medium">{endTime}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Duration</span>
              <p className="font-medium">{duration}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Run ID</span>
              <p className="font-mono text-xs">{execution.id}</p>
            </div>
          </div>
        </div>

        {/* Error */}
        {execution.error && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-destructive">Error</h4>
            <pre className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-xs overflow-auto">
              {typeof execution.error === "string"
                ? execution.error
                : JSON.stringify(execution.error, null, 2)}
            </pre>
          </div>
        )}

        {/* Input */}
        {execution.input && Object.keys(execution.input).length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Input</h4>
            <pre className="p-3 rounded-lg bg-muted/50 border border-border text-xs overflow-auto">
              {JSON.stringify(execution.input, null, 2)}
            </pre>
          </div>
        )}

        {/* Output */}
        {execution.output && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Output</h4>
            <pre className="p-3 rounded-lg bg-muted/50 border border-border text-xs overflow-auto">
              {JSON.stringify(execution.output, null, 2)}
            </pre>
          </div>
        )}

        {/* Step Results */}
        {step_results && step_results.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Step Results</h4>
            <div className="space-y-2">
              {step_results.map((result) => {
                const r = result as {
                  step_name: string;
                  status: string;
                  output?: unknown;
                  error?: unknown;
                  started_at?: string;
                  finished_at?: string;
                };
                return (
                  <div
                    key={r.step_name}
                    className="p-3 rounded-lg border border-border bg-card"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <ExecutionStatusIcon status={r.status} />
                        <span className="text-sm font-medium">
                          {r.step_name}
                        </span>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    {r.output && (
                      <div className="mt-2">
                        <span className="text-xs text-muted-foreground">
                          Output:
                        </span>
                        <pre className="mt-1 p-2 rounded bg-muted/50 text-xs overflow-auto max-h-32">
                          {JSON.stringify(r.output, null, 2)}
                        </pre>
                      </div>
                    )}
                    {r.error && (
                      <div className="mt-2">
                        <span className="text-xs text-destructive">Error:</span>
                        <pre className="mt-1 p-2 rounded bg-destructive/5 text-xs overflow-auto max-h-32">
                          {typeof r.error === "string"
                            ? r.error
                            : JSON.stringify(r.error, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}


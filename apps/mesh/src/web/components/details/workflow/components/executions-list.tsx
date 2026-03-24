import { Button } from "@deco/ui/components/button.tsx";
import { Badge } from "@deco/ui/components/badge.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { X, Check, AlertOctagon, Columns01 } from "@untitledui/icons";
import type { WorkflowExecution } from "@decocms/bindings/workflow";
import { useWorkflowExecutions } from "../hooks/queries/use-workflow-executions";
import { useViewModeStore } from "../stores/view-mode";
import { useTrackingExecutionId, useWorkflowActions } from "../stores/workflow";

interface ExecutionsListProps {
  className?: string;
}

type ExecutionStatus = WorkflowExecution["status"];

function getStatusBadge(status: ExecutionStatus) {
  switch (status) {
    case "success":
      return (
        <Badge variant="success" className="gap-1">
          <Check size={11} />
          Success
        </Badge>
      );
    case "error":
    case "failed":
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertOctagon size={11} />
          Error
        </Badge>
      );
    case "running":
      return (
        <Badge variant="secondary" className="gap-1">
          <Columns01 size={11} />
          Running
        </Badge>
      );
    case "enqueued":
      return (
        <Badge variant="secondary" className="gap-1">
          <Columns01 size={11} />
          On hold
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="secondary" className="gap-1">
          <X size={11} />
          Cancelled
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="gap-1">
          <Columns01 size={11} />
          {status}
        </Badge>
      );
  }
}

function formatExecutionId(id: string): string {
  // Take last 4 characters of the ID for display
  const shortId = id.slice(-4).toUpperCase();
  return `Run #${shortId}`;
}

export function ExecutionsList({ className }: ExecutionsListProps) {
  const { executions, isLoading } = useWorkflowExecutions();
  const { setShowExecutionsList } = useViewModeStore();
  const { setTrackingExecutionId } = useWorkflowActions();
  const trackingExecutionId = useTrackingExecutionId();

  const handleSelectExecution = (executionId: string) => {
    setTrackingExecutionId(executionId);
  };

  const handleClose = () => {
    setShowExecutionsList(false);
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-sidebar border-l border-border",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center h-12 px-5 border-b border-border shrink-0">
        <p className="flex-1 text-base font-medium text-foreground">Runs</p>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={handleClose}
        >
          <X size={11} />
        </Button>
      </div>

      {/* Executions List */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Loading executions...
          </div>
        ) : (
          executions.map((execution, index) => (
            <ExecutionRow
              key={execution.id}
              execution={execution}
              isSelected={execution.id === trackingExecutionId}
              isFirst={index === 0}
              onSelect={() => handleSelectExecution(execution.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface ExecutionRowProps {
  execution: WorkflowExecution;
  isSelected: boolean;
  isFirst: boolean;
  onSelect: () => void;
}

function ExecutionRow({
  execution,
  isSelected,
  isFirst,
  onSelect,
}: ExecutionRowProps) {
  return (
    <div
      className={cn(
        "flex flex-col justify-center h-[60px] px-4 border-b border-border cursor-pointer transition-colors",
        isSelected && "bg-accent/50",
        isFirst && isSelected && "bg-accent/50",
        !isSelected && "hover:bg-accent/30",
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2 w-full">
        {getStatusBadge(execution.status)}
        <p className="flex-1 text-base font-medium text-foreground">
          {formatExecutionId(execution.id)}
        </p>
      </div>
    </div>
  );
}

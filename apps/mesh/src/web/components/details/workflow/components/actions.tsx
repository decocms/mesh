import {
  useIsDirty,
  useTrackingExecutionId,
} from "@/web/components/details/workflow/stores/workflow";
import { Button } from "@deco/ui/components/button.js";
import { cn } from "@deco/ui/lib/utils.js";
import { Play } from "lucide-react";
import { WorkflowTabs } from "./tabs";
import { ClockFastForward } from "@untitledui/icons";
import { usePanelsActions } from "../stores/panels";
import { useWorkflowStart } from "../hooks/use-execution-actions";
import { usePollingWorkflowExecution } from "../hooks/use-workflow-collection-item";
import { Spinner } from "@deco/ui/components/spinner.js";

export function WorkflowActions() {
  const { togglePanel } = usePanelsActions();
  return (
    <>
      <WorkflowTabs />
      <Button
        variant={"outline"}
        size="xs"
        onClick={() => togglePanel("executions")}
      >
        <ClockFastForward className="w-4 h-4" />
      </Button>
      <WorkflowCollectionActions />
    </>
  );
}

function useIsExecutionCompleted() {
  const trackingExecutionId = useTrackingExecutionId();
  const { item } = usePollingWorkflowExecution(trackingExecutionId);
  return item?.completed_at_epoch_ms !== null;
}

function WorkflowCollectionActions() {
  const isDirty = useIsDirty();
  const isExecutionCompleted = useIsExecutionCompleted();
  const trackingExecutionId = useTrackingExecutionId();
  const { handleRunWorkflow } = useWorkflowStart();
  const trackingExecutionIsRunning =
    trackingExecutionId && !isExecutionCompleted;
  return (
    <div className="flex gap-1">
      <Button
        variant="default"
        className={cn(
          trackingExecutionId &&
            "bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground",
          !trackingExecutionId &&
            "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
          trackingExecutionIsRunning &&
            "bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground cursor-not-allowed",
        )}
        size="xs"
        disabled={trackingExecutionIsRunning || isDirty}
        onClick={handleRunWorkflow}
      >
        {!trackingExecutionIsRunning && <Play className="w-4 h-4" />}
        {trackingExecutionIsRunning && <Spinner size="xs" />}
        {trackingExecutionId
          ? isExecutionCompleted
            ? "Replay"
            : "Running..."
          : "Run workflow"}
      </Button>
    </div>
  );
}

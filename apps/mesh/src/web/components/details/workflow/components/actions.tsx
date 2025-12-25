import {
  useIsDirty,
  useTrackingExecutionId,
  useWorkflow,
  useWorkflowActions,
} from "@/web/components/details/workflow/stores/workflow";
import { Button } from "@deco/ui/components/button.js";
import { cn } from "@deco/ui/lib/utils.js";
import { History, RefreshCcw, Save, StepForward, X } from "lucide-react";
import { useActivePanels, usePanelsActions } from "../stores/panels";

export function WorkflowActions({
  onUpdate,
}: {
  onUpdate: (updates: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <>
      <WorkflowPanels />
      <WorkflowCollectionActions onUpdate={onUpdate} />
    </>
  );
}

function WorkflowPanels() {
  const activePanels = useActivePanels();
  const isExecutionsPanelActive = activePanels.executions;
  const { togglePanel } = usePanelsActions();
  return (
    <div className="bg-muted border border-border rounded-lg flex">
      <Button
        variant="outline"
        size="xs"
        className={cn(
          "h-7 border-0 text-foreground",
          !isExecutionsPanelActive && "bg-transparent text-muted-foreground",
        )}
        onClick={() => togglePanel("step")}
      >
        <StepForward className="w-4 h-4" />
      </Button>
      <Button
        variant="outline"
        size="xs"
        className={cn(
          "h-7 border-0 text-foreground",
          isExecutionsPanelActive && "bg-transparent text-muted-foreground",
        )}
        onClick={() => togglePanel("executions")}
      >
        <History className="w-4 h-4" />
      </Button>
    </div>
  );
}

function WorkflowCollectionActions({
  onUpdate,
}: {
  onUpdate: (updates: Record<string, unknown>) => Promise<void>;
}) {
  const isDirty = useIsDirty();
  const { resetToOriginalWorkflow, setOriginalWorkflow } = useWorkflowActions();
  const trackingExecutionId = useTrackingExecutionId();
  const { setTrackingExecutionId } = useWorkflowActions();
  const workflow = useWorkflow();
  return (
    <div className="flex gap-1">
      {trackingExecutionId && (
        <Button
          variant="outline"
          size="xs"
          onClick={() => {
            setTrackingExecutionId(undefined);
          }}
          disabled={!trackingExecutionId}
        >
          <X className="w-4 h-4" />
        </Button>
      )}
      <Button
        variant="default"
        size="xs"
        onClick={() => {
          onUpdate(workflow).then(() => {
            setOriginalWorkflow(workflow);
          });
        }}
        disabled={!isDirty}
      >
        <Save className="w-4 h-4" />
      </Button>
      <Button
        variant="secondary"
        size="xs"
        disabled={!isDirty}
        onClick={() => resetToOriginalWorkflow()}
      >
        <RefreshCcw className="w-4 h-4" />
      </Button>
    </div>
  );
}

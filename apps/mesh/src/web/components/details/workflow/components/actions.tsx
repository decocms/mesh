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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.js";

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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                setTrackingExecutionId(undefined);
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Stop tracking execution</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="default"
            className={cn(
              !isDirty &&
                "bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground cursor-not-allowed",
            )}
            size="xs"
            onClick={() => {
              if (isDirty) {
                onUpdate(workflow).then(() => {
                  setOriginalWorkflow(workflow);
                });
              }
            }}
          >
            <Save className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isDirty ? "Save workflow" : "Workflow is up to date"}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="xs"
            onClick={() => {
              resetToOriginalWorkflow();
              setTrackingExecutionId(undefined);
            }}
          >
            <RefreshCcw className="w-4 h-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Reset to original workflow</TooltipContent>
      </Tooltip>
    </div>
  );
}

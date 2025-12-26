import {
  useIsDirty,
  useTrackingExecutionId,
  useWorkflow,
  useWorkflowActions,
} from "@/web/components/details/workflow/stores/workflow";
import { Button } from "@deco/ui/components/button.js";
import { cn } from "@deco/ui/lib/utils.js";
import { Loader2, Play, RefreshCcw, Save, X } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.js";
import { useSyncExternalStore } from "react";
import { useWorkflowStart } from "../hooks/use-workflow-start";
import { usePanelsActions } from "../stores/panels";
import { toast } from "@deco/ui/components/sonner.tsx";

// Navigation protection hook that warns before leaving with unsaved changes
function useNavigationProtection(isDirty: boolean) {
  useSyncExternalStore(
    (_onStoreChange) => {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (isDirty) {
          e.preventDefault();
          e.returnValue = "";
        }
      };

      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => {
        window.removeEventListener("beforeunload", handleBeforeUnload);
      };
    },
    () => isDirty,
    () => false,
  );
}

export function WorkflowActions({
  onUpdate,
}: {
  onUpdate: (updates: Record<string, unknown>) => Promise<void>;
}) {
  const isDirty = useIsDirty();

  // Warn before leaving with unsaved changes
  useNavigationProtection(isDirty);

  return (
    <div className="flex gap-1">
      <WorkflowCollectionActions onUpdate={onUpdate} />
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
  const { handleRunWorkflow, isPending } = useWorkflowStart();
  const { setRightPanelTab, setViewingRunId } = usePanelsActions();

  const handleRun = async () => {
    if (isDirty || isPending) return;
    try {
      const executionId = await handleRunWorkflow();
      // Switch to runs tab and view the new execution
      setRightPanelTab("runs");
      setViewingRunId(executionId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start workflow",
      );
    }
  };

  return (
    <div className="flex gap-1">
      {trackingExecutionId && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              onClick={() => {
                setTrackingExecutionId(undefined);
              }}
            >
              <X className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Stop tracking execution</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className="size-7"
            onClick={() => {
              resetToOriginalWorkflow();
              setTrackingExecutionId(undefined);
            }}
          >
            <RefreshCcw className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Reset to original workflow</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="default"
            size="icon"
            className={cn(
              "size-7",
              !isDirty &&
                "bg-muted text-muted-foreground hover:bg-muted hover:text-muted-foreground cursor-not-allowed",
            )}
            onClick={() => {
              if (isDirty) {
                onUpdate(workflow).then(() => {
                  setOriginalWorkflow(workflow);
                });
              }
            }}
          >
            <Save className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isDirty ? "Save workflow" : "Workflow is up to date"}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="default"
            size="icon"
            className="size-7"
            onClick={handleRun}
            disabled={isDirty || isPending}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isDirty ? "Save workflow first to run" : "Run workflow"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

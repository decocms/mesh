import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Pause, Play, Zap } from "lucide-react";
import { Button } from "@deco/ui/components/button.tsx";
import { Card, CardHeader, CardTitle } from "@deco/ui/components/card.tsx";
import { cn } from "@deco/ui/lib/utils.js";
import { useToolCallMutation } from "@/web/hooks/use-tool-call";
import { createToolCaller } from "@/tools/client";
import {
  useIsAddingStep,
  useIsDirty,
  useTrackingExecutionId,
  useWorkflow,
  useWorkflowActions,
} from "@/web/components/details/workflow/stores/workflow";
import { useWorkflowBindingConnection } from "../../../hooks/use-workflow-binding-connection";
import { useWorkflowExecutionCollectionItem } from "../../../hooks/use-workflow-collection-item";
import { ExecutionScheduleTooltip, useIsExecutionScheduled } from "../../..";

// ============================================
// Workflow Start Hook
// ============================================

function useWorkflowStart() {
  const { id: connectionId } = useWorkflowBindingConnection();
  const { setTrackingExecutionId } = useWorkflowActions();
  const toolCaller = createToolCaller(connectionId);
  const workflow = useWorkflow();
  const { mutateAsync: startWorkflow, isPending } = useToolCallMutation({
    toolCaller,
    toolName: "COLLECTION_WORKFLOW_EXECUTION_CREATE",
  });
  const handleRunWorkflow = async () => {
    const startAtEpochMs = Date.now();
    const timeoutMs = 30000;
    const result = await startWorkflow({
      workflow_id: workflow.id,
      input: {},
      start_at_epoch_ms: startAtEpochMs,
      timeout_ms: timeoutMs,
    });

    const executionId =
      (result as { id: string }).id ??
      (result as { structuredContent: { id: string } }).structuredContent.id;
    setTrackingExecutionId(executionId);
    return executionId;
  };

  return { handleRunWorkflow, isPending };
}

function useWorkflowResume() {
  const { id: connectionId } = useWorkflowBindingConnection();
  const toolCaller = createToolCaller(connectionId);
  const trackingExecutionId = useTrackingExecutionId();

  const { mutateAsync: resumeWorkflow, isPending } = useToolCallMutation({
    toolCaller,
    toolName: "RESUME_EXECUTION",
  });

  const handleResumeWorkflow = async () => {
    await resumeWorkflow({
      executionId: trackingExecutionId,
    });
  };

  return { handleResumeWorkflow, isPending };
}

function useWorkflowCancel() {
  const { id: connectionId } = useWorkflowBindingConnection();
  const toolCaller = createToolCaller(connectionId);
  const trackingExecutionId = useTrackingExecutionId();

  const { mutateAsync: cancelWorkflow, isPending } = useToolCallMutation({
    toolCaller,
    toolName: "CANCEL_EXECUTION",
  });

  const handleCancelWorkflow = async () => {
    await cancelWorkflow({
      executionId: trackingExecutionId,
    });
  };

  return { handleCancelWorkflow, isPending };
}

// ============================================
// Trigger Node Component
// ============================================

function PauseButton() {
  const { handleCancelWorkflow } = useWorkflowCancel();

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleCancelWorkflow();
  };
  return (
    <Button variant="ghost" size="xs" onClick={handleTriggerClick}>
      <Pause className="w-4 h-4 text-foreground cursor-pointer hover:text-primary transition-colors" />
    </Button>
  );
}

function PlayButton() {
  const { handleRunWorkflow } = useWorkflowStart();
  const isDirty = useIsDirty();
  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleRunWorkflow();
  };
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={handleTriggerClick}
      disabled={isDirty}
    >
      <Play className="w-4 h-4 text-foreground cursor-pointer hover:text-primary transition-colors" />
    </Button>
  );
}

function ResumeButton() {
  const { handleResumeWorkflow } = useWorkflowResume();

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleResumeWorkflow();
  };
  return (
    <Button variant="ghost" size="xs" onClick={handleTriggerClick}>
      <Play className="w-4 h-4 text-primary cursor-pointer hover:text-primary transition-colors" />
    </Button>
  );
}

export const TriggerNode = memo(function TriggerNode() {
  const isAddingStep = useIsAddingStep();
  const trackingExecutionId = useTrackingExecutionId();
  const { addStepAfter } = useWorkflowActions();
  const { item: execution } =
    useWorkflowExecutionCollectionItem(trackingExecutionId);
  const isScheduled = useIsExecutionScheduled(trackingExecutionId);
  const isRunning = execution?.completed_at_epoch_ms === null;
  const isPaused = execution?.status === "cancelled";
  const isDirty = useIsDirty();
  const workflow = useWorkflow();

  // Trigger is clickable to add a step when there are no steps (empty workflow)
  // or when all root steps have no dependents (trigger is also a "terminal" point)
  const hasNoSteps =
    workflow.steps.filter((s) => s.name !== "Manual").length === 0;
  const canAddAfterTrigger = isAddingStep && hasNoSteps;

  const handleClick = () => {
    if (canAddAfterTrigger) {
      // Add step with @input reference (first step after trigger)
      addStepAfter("input");
    }
  };

  return (
    <div className="relative">
      <div className="flex flex-col items-start">
        <div className="bg-muted border-border text-muted-foreground h-5 flex items-center gap-1 border px-2 py-1 rounded-t-md w-fit ml-2 border-b-0">
          <Zap size={13} className="text-muted-foreground block" />
          <span className="uppercase font-normal font-mono text-xs leading-3 text-muted-foreground block mt-px">
            Trigger
          </span>
        </div>
        <Card
          title={isDirty ? "Save or discard changes to run" : undefined}
          onClick={handleClick}
          className={cn(
            "sm:w-40 lg:w-52 xl:w-64 p-0 px-3 h-12 group flex items-center justify-center relative",
            "transition-all duration-200",
            // Highlight trigger when it's a valid target for adding steps
            canAddAfterTrigger && [
              "cursor-pointer",
              "ring-2 ring-primary ring-offset-2 ring-offset-background",
              "hover:shadow-lg hover:shadow-primary/20",
              "hover:scale-[1.02]",
            ],
            // Dim trigger when adding but not a valid target
            isAddingStep && !canAddAfterTrigger && "opacity-50",
            !isAddingStep && "cursor-pointer",
            isDirty && "cursor-auto",
          )}
        >
          <CardHeader className="flex items-center justify-between gap-2 p-0 w-full ">
            <div className="flex flex-1 items-center gap-2 min-w-0">
              <div className="h-6 w-6 p-1 shrink-0 flex items-center justify-center rounded-md">
                {isScheduled && (
                  <ExecutionScheduleTooltip id={trackingExecutionId} />
                )}
                {isPaused && <ResumeButton />}
                {isRunning && !isPaused && <PauseButton />}
                {!isRunning && !isPaused && <PlayButton />}
              </div>

              <CardTitle
                className={cn(
                  "p-0 text-sm font-medium truncate",
                  isDirty && "text-muted-foreground",
                )}
              >
                Manual
              </CardTitle>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Source handle - hidden */}
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        className="bg-transparent w-1 h-1 border-0 opacity-0"
      />
    </div>
  );
});

export default TriggerNode;

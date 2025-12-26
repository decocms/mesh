import { ScrollArea } from "@deco/ui/components/scroll-area.tsx";
import { Spinner } from "@deco/ui/components/spinner.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@deco/ui/components/alert-dialog.tsx";
import { useState } from "react";
import {
  type StepType,
  useIsDirty,
  useTrackingExecutionId,
  useWorkflowActions,
  useWorkflowSteps,
} from "../../stores/workflow";
import { usePollingWorkflowExecution } from "../../hooks/use-workflow-collection-item";
import { useToolActionTab } from "../../stores/step-tabs";
import { ListItem } from "./list-item";
import { AddStepButton } from "./add-step-button";
import { AddFirstStepButton } from "../steps/new-step-button";
import { useWorkflowStart } from "../../hooks/use-workflow-start";
import { usePanelsActions } from "../../stores/panels";
import { toast } from "@deco/ui/components/sonner.tsx";

export function WorkflowListView() {
  const steps = useWorkflowSteps();
  const trackingExecutionId = useTrackingExecutionId();
  const isDirty = useIsDirty();
  const { step_results: executionStepResults, isLoading } =
    usePollingWorkflowExecution(trackingExecutionId);
  const {
    deleteStep,
    appendStep,
    insertStepAtIndex,
    setCurrentStepName,
    startAddingStep,
  } = useWorkflowActions();
  const { setActiveTab } = useToolActionTab();
  const { handleRunWorkflow, isPending: isRunPending } = useWorkflowStart();
  const { setRightPanelTab, setViewingRunId } = usePanelsActions();

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [hoveredStepIndex, setHoveredStepIndex] = useState<number | null>(null);

  // Build step results map from execution
  const stepResults = new Map<
    string,
    { status: string; startTime?: string; endTime?: string }
  >();
  if (executionStepResults) {
    for (const result of executionStepResults) {
      const r = result as {
        step_name: string;
        status: string;
        started_at?: string;
        finished_at?: string;
      };
      stepResults.set(r.step_name, {
        status: r.status,
        startTime: r.started_at ?? undefined,
        endTime: r.finished_at ?? undefined,
      });
    }
  }

  const handleAddStep = (type: StepType, afterStepName?: string) => {
    if (afterStepName) {
      // Insert after specific step
      const afterIndex = steps.findIndex((s) => s.name === afterStepName);
      if (afterIndex !== -1 && insertStepAtIndex) {
        startAddingStep(type);
        // For now, we'll use appendStep and let the store handle positioning
        // The insertStepAtIndex action will be implemented next
        insertStepAtIndex(afterIndex + 1, type);
      }
    } else {
      // Append to end
      appendStep({ type });
    }
    setActiveTab("connections");
  };

  const handleDelete = (stepName: string) => {
    setDeleteConfirm(stepName);
  };

  const confirmDelete = () => {
    if (deleteConfirm) {
      deleteStep(deleteConfirm);
      setDeleteConfirm(null);
      setCurrentStepName(undefined);
    }
  };

  const handlePlay = async (stepName: string) => {
    if (isDirty) {
      toast.error("Save workflow before running");
      return;
    }
    if (isRunPending) {
      return;
    }
    try {
      const executionId = await handleRunWorkflow(stepName);
      // Switch to runs tab and view the new execution
      setRightPanelTab("runs");
      setViewingRunId(executionId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start workflow",
      );
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const hasSteps = steps.length > 0;

  return (
    <div className="h-full flex flex-col bg-background">
      <ScrollArea className="flex-1">
        {!hasSteps ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              No steps yet. Add your first step to get started.
            </p>
            <AddFirstStepButton onAdd={(type) => handleAddStep(type)} />
          </div>
        ) : (
          <div className="flex flex-col py-2">
            {steps.map((step, index) => {
              const previousStep = steps[index - 1];
              const showAboveButton = hoveredStepIndex === index && index > 0;
              const showBelowButton = hoveredStepIndex === index;
              const isLastStep = index === steps.length - 1;

              return (
                <div
                  key={step.name}
                  onMouseEnter={() => setHoveredStepIndex(index)}
                  onMouseLeave={() => setHoveredStepIndex(null)}
                >
                  {/* Add step button above (shown when hovering this step) */}
                  {!trackingExecutionId && previousStep && (
                    <AddStepButton
                      onAdd={handleAddStep}
                      afterStepName={previousStep.name}
                      visible={showAboveButton}
                    />
                  )}
                  <ListItem
                    step={step}
                    index={index}
                    stepResult={stepResults.get(step.name)}
                    onDelete={handleDelete}
                    onPlay={handlePlay}
                  />
                  {/* Add step button below (shown when hovering this step or is last) */}
                  {!trackingExecutionId && (
                    <AddStepButton
                      onAdd={handleAddStep}
                      afterStepName={step.name}
                      visible={showBelowButton || (isLastStep && hoveredStepIndex === null)}
                      isLast={isLastStep}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete step</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm}"? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


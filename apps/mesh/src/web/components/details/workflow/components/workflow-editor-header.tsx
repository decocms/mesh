import { Button } from "@deco/ui/components/button.tsx";
import { ViewModeToggle } from "@deco/ui/components/view-mode-toggle.tsx";
import {
  ArrowLeft,
  GitBranch01,
  Code02,
  FlipBackward,
  Save02,
  ClockFastForward,
  Play,
} from "@untitledui/icons";
import { Spinner } from "@deco/ui/components/spinner.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { useViewModeStore, type WorkflowViewMode } from "../stores/view-mode";
import {
  useIsDirty,
  useTrackingExecutionId,
  useWorkflowActions,
  useWorkflowSteps,
} from "../stores/workflow";
import { useWorkflowStart, usePollingWorkflowExecution } from "../hooks";
import { cn } from "@deco/ui/lib/utils.ts";

interface WorkflowEditorHeaderProps {
  title: string;
  description?: string;
  onBack: () => void;
  onSave: () => void;
}

export function WorkflowEditorHeader({
  title,
  description,
  onBack,
  onSave,
}: WorkflowEditorHeaderProps) {
  const { viewMode, setViewMode } = useViewModeStore();
  const { resetToOriginalWorkflow } = useWorkflowActions();
  const isDirty = useIsDirty();

  return (
    <div className="flex items-center h-12 border-b border-border shrink-0 bg-background">
      {/* Back Button */}
      <div className="flex items-center justify-center size-12 border-r border-border">
        <Button
          variant="ghost"
          size="icon"
          className="size-10 text-muted-foreground hover:text-foreground"
          onClick={onBack}
        >
          <ArrowLeft size={16} />
        </Button>
      </div>

      {/* Title and Description */}
      <div className="flex-1 flex items-center gap-3 px-4 min-w-0">
        <h2 className="text-sm font-medium text-foreground truncate">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-muted-foreground truncate">
            {description}
          </p>
        )}
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2 px-4">
        {/* View Mode Toggle */}
        <ViewModeToggle<WorkflowViewMode>
          value={viewMode}
          onValueChange={setViewMode}
          size="sm"
          options={[
            { value: "visual", icon: <GitBranch01 /> },
            { value: "code", icon: <Code02 /> },
          ]}
        />

        {/* Undo Button */}
        <Button
          variant="outline"
          size="icon"
          className="size-7"
          onClick={resetToOriginalWorkflow}
          disabled={!isDirty}
          title="Reset changes"
        >
          <FlipBackward size={14} />
        </Button>

        {/* Save Button */}
        <Button
          variant="outline"
          size="icon"
          className="size-7"
          onClick={onSave}
          disabled={!isDirty}
          title="Save workflow"
        >
          <Save02 size={14} />
        </Button>

        {/* Schedule Button */}
        <Button
          variant="outline"
          size="icon"
          className="size-7"
          title="Schedule workflow"
        >
          <ClockFastForward size={14} />
        </Button>

        {/* Run Workflow Button */}
        <RunWorkflowButton />
      </div>
    </div>
  );
}

function useIsExecutionCompleted() {
  const trackingExecutionId = useTrackingExecutionId();
  const { item } = usePollingWorkflowExecution(trackingExecutionId);
  return item?.completed_at_epoch_ms !== null;
}

function RunWorkflowButton() {
  const isDirty = useIsDirty();
  const isExecutionCompleted = useIsExecutionCompleted();
  const trackingExecutionId = useTrackingExecutionId();
  const { handleRunWorkflow } = useWorkflowStart();
  const steps = useWorkflowSteps();
  const trackingExecutionIsRunning =
    trackingExecutionId && !isExecutionCompleted;

  const hasEmptySteps = steps.some(
    (step) =>
      "toolName" in step.action &&
      (!step.action.toolName || step.action.toolName === ""),
  );

  const isDisabled = trackingExecutionIsRunning || isDirty || hasEmptySteps;

  const getTooltipMessage = () => {
    if (trackingExecutionIsRunning) return "Workflow is currently running";
    if (isDirty) return "Save your changes before running";
    if (hasEmptySteps) return "All steps must have a tool selected";
    return null;
  };

  const tooltipMessage = getTooltipMessage();

  const button = (
    <Button
      variant="default"
      size="sm"
      className={cn(
        "gap-2 h-7 px-3",
        !trackingExecutionIsRunning &&
          "bg-primary text-primary-foreground hover:bg-primary/90",
      )}
      disabled={isDisabled}
      onClick={handleRunWorkflow}
    >
      {!trackingExecutionIsRunning && <Play size={14} />}
      {trackingExecutionIsRunning && <Spinner size="xs" />}
      {trackingExecutionId
        ? isExecutionCompleted
          ? "Replay"
          : "Running..."
        : "Run workflow"}
    </Button>
  );

  if (!tooltipMessage) return button;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <span className="inline-block">{button}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltipMessage}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

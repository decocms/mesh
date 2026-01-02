import { GatewaySelector } from "@/web/components/chat/gateway-selector";
import { PinToSidebarButton } from "@/web/components/pin-to-sidebar-button";
import { Button } from "@deco/ui/components/button.tsx";
import { Spinner } from "@deco/ui/components/spinner.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { ViewModeToggle } from "@deco/ui/components/view-mode-toggle.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { useRouterState } from "@tanstack/react-router";
import {
  ClockFastForward,
  Code02,
  FlipBackward,
  GitBranch01,
  Play,
  Save02,
} from "@untitledui/icons";
import { Suspense, useState } from "react";
import { ViewActions, ViewTabs } from "../../layout";
import { usePollingWorkflowExecution, useWorkflowStart } from "../hooks";
import { useViewModeStore, type WorkflowViewMode } from "../stores/view-mode";
import {
  useIsDirty,
  useSelectedGatewayId,
  useTrackingExecutionId,
  useWorkflowActions,
  useWorkflowSteps,
} from "../stores/workflow";
import { WorkflowInputDialog } from "./workflow-input-dialog";

interface WorkflowEditorHeaderProps {
  title: string;
  description?: string;
  onSave: () => void;
}

export function WorkflowEditorHeader({
  title,
  description,
  onSave,
}: WorkflowEditorHeaderProps) {
  const routerState = useRouterState();
  const url = routerState.location.href;
  const { viewMode, setViewMode, showExecutionsList, toggleExecutionsList } =
    useViewModeStore();
  const { resetToOriginalWorkflow, setSelectedGatewayId } =
    useWorkflowActions();
  const isDirty = useIsDirty();
  const selectedGatewayId = useSelectedGatewayId();

  return (
    <>
      <ViewTabs>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">
            {title}
          </span>
          {description ? (
            <>
              <span className="text-xs text-muted-foreground font-normal">
                •
              </span>
              <span className="text-xs text-muted-foreground font-normal truncate min-w-0 max-w-[20ch]">
                {description}
              </span>
            </>
          ) : null}
        </div>
      </ViewTabs>

      <ViewActions>
        <PinToSidebarButton title={title} url={url} icon="workflow" />

        <Suspense fallback={<Spinner size="xs" />}>
          <GatewaySelector
            selectedGatewayId={selectedGatewayId}
            onGatewayChange={setSelectedGatewayId}
            variant="bordered"
            placeholder="Select gateway"
          />
        </Suspense>

        <ViewModeToggle<WorkflowViewMode>
          value={viewMode}
          onValueChange={setViewMode}
          size="sm"
          options={[
            { value: "visual", icon: <GitBranch01 /> },
            { value: "code", icon: <Code02 /> },
          ]}
        />

        <Button
          variant="outline"
          size="icon"
          className="size-7 border border-input"
          onClick={resetToOriginalWorkflow}
          disabled={!isDirty}
          title="Reset changes"
        >
          <FlipBackward size={14} />
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="size-7 border border-input"
          onClick={onSave}
          disabled={!isDirty}
          title="Save workflow"
        >
          <Save02 size={14} />
        </Button>

        <Button
          variant={showExecutionsList ? "secondary" : "outline"}
          size="icon"
          className="size-7 border border-input"
          onClick={toggleExecutionsList}
          title={showExecutionsList ? "Hide runs" : "Show runs"}
        >
          <ClockFastForward size={14} />
        </Button>

        <RunWorkflowButton />
      </ViewActions>
    </>
  );
}

function useIsExecutionCompleted() {
  const trackingExecutionId = useTrackingExecutionId();
  const { item } = usePollingWorkflowExecution(trackingExecutionId);
  return item?.completed_at_epoch_ms != null;
}

function RunWorkflowButton() {
  const isDirty = useIsDirty();
  const isExecutionCompleted = useIsExecutionCompleted();
  const trackingExecutionId = useTrackingExecutionId();
  const selectedGatewayId = useSelectedGatewayId();
  const { handleRunWorkflow, isPending, requiresInput, inputSchema } =
    useWorkflowStart();
  const steps = useWorkflowSteps();
  const [showInputDialog, setShowInputDialog] = useState(false);

  const trackingExecutionIsRunning =
    trackingExecutionId && !isExecutionCompleted;

  const hasEmptySteps = steps.some(
    (step) =>
      "toolName" in step.action &&
      (!step.action.toolName || step.action.toolName === ""),
  );

  const hasNoGateway = !selectedGatewayId;

  const isDisabled =
    trackingExecutionIsRunning || isDirty || hasEmptySteps || hasNoGateway;

  const getTooltipMessage = () => {
    if (trackingExecutionIsRunning) return "Workflow is currently running";
    if (isDirty) return "Save your changes before running";
    if (hasNoGateway) return "Select a gateway first";
    if (hasEmptySteps) return "All steps must have a tool selected";
    return null;
  };

  const tooltipMessage = getTooltipMessage();

  const handleClick = () => {
    if (requiresInput && inputSchema) {
      setShowInputDialog(true);
    } else {
      handleRunWorkflow({});
    }
  };

  const handleInputSubmit = async (input: Record<string, unknown>) => {
    await handleRunWorkflow(input);
  };

  const buttonLabel = trackingExecutionId
    ? isExecutionCompleted
      ? "Replay"
      : "Running..."
    : requiresInput
      ? "Run with input..."
      : "Run workflow";

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
      onClick={handleClick}
    >
      {!trackingExecutionIsRunning && <Play size={14} />}
      {trackingExecutionIsRunning && <Spinner size="xs" />}
      {buttonLabel}
    </Button>
  );

  const buttonWithTooltip = tooltipMessage ? (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <span className="inline-block">{button}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltipMessage}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    button
  );

  return (
    <>
      {buttonWithTooltip}
      {requiresInput && inputSchema && (
        <WorkflowInputDialog
          open={showInputDialog}
          onOpenChange={setShowInputDialog}
          inputSchema={inputSchema}
          onSubmit={handleInputSubmit}
          isPending={isPending}
        />
      )}
    </>
  );
}

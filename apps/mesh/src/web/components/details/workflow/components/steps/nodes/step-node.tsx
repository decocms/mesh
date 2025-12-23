import { memo, useRef, useSyncExternalStore } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  BellIcon,
  CheckIcon,
  ClockIcon,
  CodeXml,
  Repeat,
  Wrench,
} from "lucide-react";
import type {
  Step,
  StepAction,
  WaitForSignalAction,
} from "@decocms/bindings/workflow";
import { Card, CardHeader, CardTitle } from "@deco/ui/components/card.tsx";
import { cn } from "@deco/ui/lib/utils.js";
import {
  useWorkflowActions,
  useIsAddingStep,
  useTrackingExecutionId,
  useIsTerminalStep,
  useCurrentStepName,
} from "@/web/components/details/workflow/stores/workflow";
import type { StepNodeData } from "../use-workflow-flow";
import { createToolCaller } from "@/tools/client";
import { useToolCallMutation } from "@/web/hooks/use-tool-call";
import { Spinner } from "@deco/ui/components/spinner.js";
import { useWorkflowBindingConnection } from "../../../hooks/use-workflow-binding-connection";
import { usePollingWorkflowExecution } from "../../../hooks/use-workflow-collection-item";
import { Badge } from "@deco/ui/components/badge.js";

// ============================================
// Duration Component
// ============================================

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) return `${milliseconds}ms`;

  const totalSeconds = milliseconds / 1000;
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) return `${hours}h ${minutes}m ${seconds.toFixed(1)}s`;
  if (minutes > 0) return `${minutes}m ${seconds.toFixed(1)}s`;
  return `${seconds.toFixed(1)}s`;
}

export function useCurrentTime() {
  const timeRef = useRef(Date.now());
  const subscribe = (callback: () => void) => {
    const interval = setInterval(() => {
      timeRef.current = Date.now();
      callback();
    }, 100);
    return () => clearInterval(interval);
  };
  const getSnapshot = () => {
    return timeRef.current;
  };
  const currentTime = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return currentTime;
}

function Duration({
  startTime,
  endTime,
  isRunning,
}: {
  startTime: string | null | undefined;
  endTime: string | null | undefined;
  isRunning: boolean;
}) {
  const currentTime = useCurrentTime();

  if (!startTime) return null;

  const start = new Date(startTime).getTime();
  let duration: number;

  if (endTime) {
    duration = Math.max(0, new Date(endTime).getTime() - start);
  } else if (isRunning) {
    duration = Math.max(0, currentTime - start);
  } else {
    return null;
  }

  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {formatDuration(duration)}
    </span>
  );
}

// ============================================
// Step Icon
// ============================================

function getStepIcon(step: Step) {
  const { action } = step;

  if ("toolName" in action) {
    return <Wrench className="w-4 h-4" />;
  }
  if ("code" in action) {
    return <CodeXml className="w-4 h-4" />;
  }
  if ("sleepMs" in action || "sleepUntil" in action) {
    return <ClockIcon className="w-4 h-4" />;
  }
  if ("signalName" in action) {
    return <BellIcon className="w-4 h-4" />;
  }

  return <Wrench className="w-4 h-4" />;
}

// ============================================
// Step Node Component
// ============================================

function checkIfIsWaitForSignalAction(
  action: StepAction,
): action is WaitForSignalAction {
  return "signalName" in action;
}

function useSendSignalMutation() {
  const { id: connectionId } = useWorkflowBindingConnection();
  const toolCaller = createToolCaller(connectionId);

  const { mutateAsync: sendSignal, isPending } = useToolCallMutation({
    toolCaller,
    toolName: "SEND_SIGNAL",
  });

  const handleSendSignal = async (
    executionId: string,
    signalName: string,
    payload: unknown,
  ): Promise<{
    success: boolean;
    signalId: string | undefined;
    message: string | undefined;
  }> => {
    const result = await sendSignal({
      executionId,
      signalName,
      payload,
    });
    return result as {
      success: boolean;
      signalId: string | undefined;
      message: string | undefined;
    };
  };

  return { sendSignal: handleSendSignal, isPending };
}

type WorkflowExecutionStepResult = {
  output?: unknown;
  error?: unknown;
  startedAt: number;
  stepId: string;
  executionId: string;
  completedAt?: number;
};

function getStepStyle(
  step: Step,
  stepResult?: WorkflowExecutionStepResult | null,
) {
  const isSignal = checkIfIsWaitForSignalAction(step.action);
  if (!stepResult) return "default";
  if (stepResult.error) return "error";
  if (!stepResult.output) return "pending";
  if (stepResult.output) return "success";
  if (isSignal && !stepResult.completedAt) return "waiting_for_signal";
  return "default";
}

export const StepNode = memo(function StepNode({ data }: NodeProps) {
  const { step, isBranchRoot } = data as StepNodeData;
  const trackingExecutionId = useTrackingExecutionId();
  const isAddingStep = useIsAddingStep();
  const isTerminalStep = useIsTerminalStep(step.name);
  const { addStepAfter, setCurrentStepName } = useWorkflowActions();
  const { sendSignal, isPending: isSendingSignal } = useSendSignalMutation();
  const currentStepName = useCurrentStepName();
  const { item: pollingExecution } =
    usePollingWorkflowExecution(trackingExecutionId);

  // When adding a step, only terminal steps can be clicked to add after
  const canAddAfter = isAddingStep && isTerminalStep;

  const isForEachStep = step.config?.loop?.for !== undefined;

  const stepResult = pollingExecution?.step_results.find((s) => {
    if (isForEachStep) {
      return s.stepId.startsWith(step.name + "[");
    }
    return s.stepId === step.name;
  });
  const isConsumed = !!stepResult?.output;
  const style = getStepStyle(step, stepResult);

  const displayIcon = (() => {
    if (!step.action) return null;
    if (
      step.action &&
      checkIfIsWaitForSignalAction(step.action) &&
      isConsumed
    ) {
      return <CheckIcon className="w-4 h-4 text-primary-foreground" />;
    }
    return getStepIcon(step);
  })();

  const selectStep = (e: React.MouseEvent) => {
    if (step.name === currentStepName) {
      setCurrentStepName(undefined);
      return;
    }
    // When adding a step, clicking on a terminal step adds the new step after it
    if (canAddAfter) {
      e.stopPropagation();
      addStepAfter(step.name);
      return;
    }
    // When adding but not a terminal step, do nothing (can't add after non-terminal)
    if (isAddingStep && !isTerminalStep) {
      return;
    }
    setCurrentStepName(step.name);
  };

  const handleIconClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (
      step.action &&
      checkIfIsWaitForSignalAction(step.action) &&
      trackingExecutionId
    ) {
      sendSignal(
        trackingExecutionId,
        step.action.signalName,
        stepResult?.output,
      );
    }
  };

  const badgeContent = () => {
    if (!trackingExecutionId) return <Repeat className="w-4 h-4" />;
    if (isForEachStep) {
      return `${Number(stepResult?.stepId.split("[").pop()?.split("]")[0]) + 1} / ${Object.keys(stepResult ?? {}).length}`;
    }
    return null;
  };

  return (
    <div className="group relative">
      {/* Target handle - hidden, just for receiving edges */}
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        className="bg-transparent w-1 h-1 border-0 opacity-0"
      />

      <Card
        onClick={selectStep}
        className={cn(
          "sm:w-20 lg:w-28 xl:w-32 p-0 px-3 h-12 flex items-center justify-center relative",
          "transition-all duration-200",
          style === "pending" && "animate-pulse border-warning",
          style === "error" && "border-destructive",
          style === "success" && "border-success",
          style === "waiting_for_signal" && "border-primary animate-pulse",
          // Conditional step styling
          isBranchRoot && "border-l-2 border-l-violet-500",
          // Highlight terminal steps when in add-step mode
          canAddAfter && [
            "cursor-pointer",
            "ring-2 ring-primary ring-offset-2 ring-offset-background",
            "hover:shadow-lg hover:shadow-primary/20",
            "hover:scale-[1.02]",
          ],
          // Dim non-terminal steps when in add-step mode
          isAddingStep && !canAddAfter && ["opacity-50 cursor-not-allowed"],
          // Normal selection state
          !isAddingStep &&
            currentStepName === step.name &&
            "bg-primary/10 border-primary hover:bg-primary/20 cursor-pointer",
          !isAddingStep &&
            currentStepName !== step.name &&
            "hover:bg-background hover:border-primary cursor-pointer",
        )}
      >
        {isForEachStep && Object.keys(stepResult?.output ?? {}).length > 0 && (
          <Badge className="absolute top-2 right-2 text-[8px] h-4 p-1 group-hover:opacity-0 group-hover:pointer-events-none">
            <>{badgeContent()}</>
          </Badge>
        )}
        <CardHeader className="flex items-center justify-between gap-2 p-0 w-full relative">
          <div className="flex flex-1 items-center gap-2 min-w-0">
            <div
              className={cn(
                "h-6 w-6 p-1 shrink-0 flex items-center justify-center rounded-md bg-primary cursor-pointer hover:bg-primary/80 transition-all",
                currentStepName === step.name &&
                  "bg-primary/10 border-primary hover:bg-primary/20",
              )}
              onClick={handleIconClick}
            >
              {isSendingSignal ? <Spinner size="xs" /> : displayIcon}
            </div>

            <CardTitle className="p-0 text-sm font-medium truncate">
              {step.name}
            </CardTitle>

            <Duration
              startTime={
                stepResult?.startedAt
                  ? new Date(stepResult.startedAt).toISOString()
                  : undefined
              }
              endTime={
                stepResult?.completedAt
                  ? new Date(stepResult.completedAt).toISOString()
                  : undefined
              }
              isRunning={
                trackingExecutionId
                  ? stepResult?.completedAt === null && !stepResult?.error
                  : false
              }
            />
          </div>
        </CardHeader>
      </Card>

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

export default StepNode;

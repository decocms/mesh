import { memo, useRef, useSyncExternalStore } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { BellIcon, ClockIcon, CodeXml, Wrench } from "lucide-react";
import type { Step } from "@decocms/bindings/workflow";
import { Card, CardHeader, CardTitle } from "@deco/ui/components/card.tsx";
import { cn } from "@deco/ui/lib/utils.js";
import {
  useWorkflowActions,
  useIsAddingStep,
  useCurrentStepName,
  useAddingStepType,
  useSelectedParentSteps,
} from "@/web/components/details/workflow/stores/workflow";
import type { StepNodeData } from "../use-workflow-flow";
import { useActivePanels, usePanelsActions } from "../../../stores/panels";

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

export function Duration({
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

export const StepNode = memo(function StepNode({ data }: NodeProps) {
  const {
    step,
    hasFinished,
    isFetching,
    isRunning,
    startTime,
    endTime,
    isError,
  } = data as StepNodeData;
  const isAddingStep = useIsAddingStep();
  const addingStepType = useAddingStepType();
  const selectedParentSteps = useSelectedParentSteps();
  const { addStepAfter, setCurrentStepName, toggleParentStepSelection } =
    useWorkflowActions();
  const currentStepName = useCurrentStepName();
  const activePanels = useActivePanels();
  const { togglePanel } = usePanelsActions();

  // When adding a step, this step can be clicked
  const canAddAfter = isAddingStep;
  // Check if this step is selected (for code steps multi-selection)
  const isSelected = selectedParentSteps.includes(step.name);

  const displayIcon = (() => {
    if (!step.action) return null;
    return getStepIcon(step);
  })();

  const selectStep = (e: React.MouseEvent) => {
    if (!activePanels.step) {
      togglePanel("step");
    }
    // When adding a step, clicking on a step either:
    // - For code steps: toggle selection (multi-select)
    // - For tool steps: immediately add after
    if (canAddAfter) {
      e.stopPropagation();
      if (addingStepType === "code") {
        toggleParentStepSelection(step.name);
      } else {
        addStepAfter(step.name);
      }
      return;
    }
    setCurrentStepName(step.name);
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
          "sm:w-40 lg:w-52 xl:w-64 p-0 px-3 h-12 flex items-center justify-center relative",
          "transition-all duration-200",
          canAddAfter && [
            "cursor-pointer",
            "ring-2 ring-offset-2 ring-offset-background",
            isSelected
              ? "ring-green-500 bg-green-500/10 border-green-500"
              : "ring-primary hover:shadow-lg hover:shadow-primary/20 hover:scale-[1.02]",
          ],
          hasFinished &&
            !isError &&
            !isSelected && ["bg-primary/10 border-primary hover:bg-primary/20"],
          isError && [
            "bg-destructive/10 border-destructive! hover:bg-destructive/20",
          ],
          isFetching && ["animate-pulse text-primary"],
          // Normal selection state
          !isAddingStep &&
            currentStepName === step.name &&
            "bg-primary/10 border-primary hover:bg-primary/20 cursor-pointer",
          !isAddingStep &&
            currentStepName !== step.name &&
            "hover:bg-background hover:border-primary cursor-pointer",
        )}
      >
        <CardHeader className="flex items-center justify-between gap-2 p-0 w-full relative">
          <div
            className={cn(
              "h-6 w-6 p-1 flex items-center justify-center rounded-md bg-primary cursor-pointer hover:bg-primary/80 transition-all",
              currentStepName === step.name &&
                "bg-primary/10 border-primary hover:bg-primary/20",
            )}
          >
            {displayIcon}
          </div>
          <CardTitle className="p-0 text-sm font-medium truncate shrink-0">
            {step.name}
          </CardTitle>
          <div className="shrink-0 flex items-center justify-center h-6 w-6 p-1">
            {startTime && (
              <Duration
                startTime={startTime}
                endTime={endTime}
                isRunning={isRunning}
              />
            )}
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

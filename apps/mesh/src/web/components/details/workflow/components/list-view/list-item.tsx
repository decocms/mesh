import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { useConnection } from "@/web/hooks/collections/use-connection";
import { Button } from "@deco/ui/components/button.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deco/ui/components/tooltip.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import type { Step, ToolCallAction } from "@decocms/bindings/workflow";
import { BellIcon, ClockIcon, CodeXml, Play, Trash2, Wrench } from "lucide-react";
import {
  useCurrentStepName,
  useTrackingExecutionId,
  useWorkflowActions,
} from "../../stores/workflow";
import { useActivePanels, usePanelsActions, useViewingRunId } from "../../stores/panels";
import { useToolActionTab } from "../../stores/step-tabs";
import { Duration } from "../steps/nodes/step-node";
import { Badge } from "@deco/ui/components/badge.tsx";

interface ListItemProps {
  step: Step;
  index: number;
  stepResult?: {
    status: string;
    startTime?: string;
    endTime?: string;
  };
  onDelete?: (stepName: string) => void;
  onPlay?: (stepName: string) => void;
}

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

function getStepTypeLabel(step: Step): string {
  const { action } = step;
  if ("toolName" in action) return "Tool";
  if ("code" in action) return "Code";
  if ("sleepMs" in action || "sleepUntil" in action) return "Sleep";
  if ("signalName" in action) return "Signal";
  return "Step";
}

function getOutputVariables(step: Step): string[] {
  if (!step.outputSchema) return [];
  const schema = step.outputSchema as { properties?: Record<string, unknown> };
  if (!schema.properties) return [];
  return Object.keys(schema.properties);
}

export function ListItem({
  step,
  stepResult,
  onDelete,
  onPlay,
}: ListItemProps) {
  const currentStepName = useCurrentStepName();
  const { setCurrentStepName } = useWorkflowActions();
  const activePanels = useActivePanels();
  const { togglePanel } = usePanelsActions();
  const { setActiveTab } = useToolActionTab();
  const trackingExecutionId = useTrackingExecutionId();
  const viewingRunId = useViewingRunId();

  const isInRunMode = !!trackingExecutionId || !!viewingRunId;
  const isSelected = currentStepName === step.name;
  const isToolStep = "toolName" in step.action;
  const connectionId = isToolStep
    ? (step.action as ToolCallAction).connectionId
    : undefined;
  const connection = useConnection(connectionId ?? "");
  const toolName = isToolStep
    ? (step.action as ToolCallAction).toolName
    : undefined;

  const isRunning = stepResult?.status === "running";
  const hasFinished =
    stepResult?.status === "success" || stepResult?.status === "error";
  const isError = stepResult?.status === "error";
  const outputVariables = getOutputVariables(step);

  const handleClick = () => {
    if (!activePanels.step) {
      togglePanel("step");
    }
    setCurrentStepName(step.name);
    if (isToolStep && connectionId) {
      setActiveTab("tool");
    }
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "group cursor-pointer transition-all duration-150 mx-4 my-2",
        "border border-border rounded-lg bg-card hover:bg-accent/30",
        isSelected && "bg-accent/50 border-accent ring-1 ring-accent/50",
        hasFinished && !isError && "bg-success/5 border-success/30",
        isError && "bg-destructive/5 border-destructive/30",
        isRunning && "animate-pulse",
      )}
    >
      {/* Card Header */}
      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <div className="shrink-0 mt-0.5">
          {connection?.icon ? (
            <IntegrationIcon
              icon={connection.icon}
              name={connection.title}
              size="sm"
            />
          ) : (
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
              {getStepIcon(step)}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {step.name}
            </span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {getStepTypeLabel(step)}
            </Badge>
          </div>
          {toolName && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {connection?.title ? `${connection.title} → ` : ""}{toolName}
            </p>
          )}
          {step.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {step.description}
            </p>
          )}
        </div>

        {/* Duration (in run mode) */}
        {stepResult?.startTime && (
          <div className="shrink-0">
            <Duration
              startTime={stepResult.startTime}
              endTime={stepResult.endTime}
              isRunning={isRunning}
            />
          </div>
        )}

        {/* Actions (shown on hover when not in run mode) */}
        {!isInRunMode && (
          <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {onPlay && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlay(step.name);
                    }}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Run up to this step</TooltipContent>
              </Tooltip>
            )}
            {onDelete && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(step.name);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete step</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>

      {/* Output Variables Footer */}
      {outputVariables.length > 0 && (
        <div className="px-4 pb-3 pt-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
              Output:
            </span>
            {outputVariables.slice(0, 5).map((varName) => (
              <Badge
                key={varName}
                variant="outline"
                className="text-[10px] px-1.5 py-0 font-mono bg-muted/50"
              >
                {varName}
              </Badge>
            ))}
            {outputVariables.length > 5 && (
              <span className="text-[10px] text-muted-foreground">
                +{outputVariables.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


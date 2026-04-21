import { Button } from "@decocms/ui/components/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@decocms/ui/components/dropdown-menu.tsx";
import { Database01, Plus, Tool01 } from "@untitledui/icons";
import { Code } from "lucide-react";
import { cn } from "@decocms/ui/lib/utils.ts";
import {
  WORKFLOW_INPUT_VIEW,
  useCurrentStepName,
  useIsInputSchemaSelected,
  useTrackingExecutionId,
  useWorkflow,
  useWorkflowActions,
  useWorkflowSteps,
} from "../stores/workflow";
import { useStepExecutionStatuses } from "../hooks/derived/use-step-execution-status";
import { usePollingWorkflowExecution } from "../hooks/queries/use-workflow-collection-item";
import { WorkflowStepCard } from "./workflow-step-card";
import { Suspense } from "react";
import type { JsonSchema } from "@/web/utils/constants";

interface WorkflowStepsCanvasProps {
  className?: string;
}

export function WorkflowStepsCanvas({ className }: WorkflowStepsCanvasProps) {
  const steps = useWorkflowSteps();
  const currentStepName = useCurrentStepName();
  const stepStatuses = useStepExecutionStatuses();
  const { setCurrentStepName, deleteStep, duplicateStep } =
    useWorkflowActions();
  const trackingExecutionId = useTrackingExecutionId();
  // Find the first error step index to determine which steps should be "skipped"
  const firstErrorIndex = stepStatuses
    ? steps.findIndex((step) => stepStatuses[step.name]?.status === "error")
    : -1;

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div className={cn("h-full flex flex-col p-8 overflow-auto", className)}>
        {/* Steps Container */}
        <div className="w-full -space-y-1">
          {/* Workflow Input Card */}
          <WorkflowInputCard />

          {/* Steps List */}
          <div className="pt-3 -space-y-1">
            {steps.map((step, index) => {
              const stepStatus = stepStatuses?.[step.name];
              // Steps after an error are "skipped" (pending but visually different)
              const isSkipped =
                firstErrorIndex !== -1 &&
                index > firstErrorIndex &&
                stepStatus?.status === "pending";
              const isLastStep = index === steps.length - 1;

              return (
                <WorkflowStepCard
                  key={step.name}
                  step={step}
                  index={index}
                  isSelected={step.name === currentStepName}
                  executionStatus={stepStatus}
                  isSkipped={isSkipped}
                  isLastStep={isLastStep}
                  onSelect={() => setCurrentStepName(step.name)}
                  onDelete={() => deleteStep(step.name)}
                  onDuplicate={() => duplicateStep(step.name)}
                />
              );
            })}
          </div>

          {trackingExecutionId ? null : <AddStepButton />}
        </div>
      </div>
    </Suspense>
  );
}

const MAX_VALUE_LENGTH = 60;

function formatInputValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") {
    return truncateStr(value, MAX_VALUE_LENGTH);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return typeof value === "object" ? "[Object]" : String(value);
  }
  return truncateStr(serialized, MAX_VALUE_LENGTH);
}

function truncateStr(str: string, max: number): string {
  if (str.length <= max) return str;
  return `${str.slice(0, max)}…`;
}

function WorkflowInputCard() {
  const workflow = useWorkflow();
  const isSelected = useIsInputSchemaSelected();
  const trackingExecutionId = useTrackingExecutionId();
  const { setCurrentStepName } = useWorkflowActions();
  const { item: executionItem } =
    usePollingWorkflowExecution(trackingExecutionId);

  const executionInput = executionItem?.input as
    | Record<string, unknown>
    | undefined;
  const isTracking = !!trackingExecutionId;

  const inputSchema = workflow.input_schema as JsonSchema | undefined;
  const properties = inputSchema?.properties as
    | Record<string, JsonSchema>
    | undefined;
  const fieldNames = properties ? Object.keys(properties) : [];

  const inputEntries = isTracking ? Object.entries(executionInput ?? {}) : [];

  return (
    <div
      className={cn(
        "flex gap-2 items-start border-1 border-transparent px-4 w-full rounded-lg cursor-pointer group hover:bg-accent/30",
        isSelected &&
          "bg-background border-1 border-border outline outline-offset-3 outline-border/25",
      )}
      onClick={() => setCurrentStepName(WORKFLOW_INPUT_VIEW)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setCurrentStepName(WORKFLOW_INPUT_VIEW);
        }
      }}
    >
      {/* Line Number placeholder */}
      <div className="w-5 shrink-0" />

      {/* Icon + Connector */}
      <div className="flex flex-col items-center shrink-0">
        <div className="h-3" />
        <div className="size-8 rounded-lg border border-border/10 bg-background shadow-sm flex items-center justify-center">
          <Database01 size={16} className="text-muted-foreground" />
        </div>
        <div className="w-px h-3 bg-border" />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col gap-2 min-w-0 pt-3 pb-3">
        <div className="flex items-center h-8">
          <span className="text-sm font-medium text-foreground truncate flex-1">
            Workflow Input
          </span>
          {isTracking
            ? inputEntries.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {inputEntries.length} value
                  {inputEntries.length !== 1 ? "s" : ""}
                </span>
              )
            : fieldNames.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {fieldNames.length} field{fieldNames.length !== 1 ? "s" : ""}
                </span>
              )}
        </div>

        {isTracking
          ? inputEntries.length > 0 && (
              <div className="flex flex-col gap-1 min-w-0">
                {inputEntries.slice(0, 5).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-baseline gap-1.5 text-xs min-w-0"
                  >
                    <span className="text-muted-foreground shrink-0 max-w-[40%] truncate">
                      {key}:
                    </span>
                    <span className="text-foreground truncate font-mono min-w-0">
                      {formatInputValue(value)}
                    </span>
                  </div>
                ))}
                {inputEntries.length > 5 && (
                  <span className="text-xs text-muted-foreground">
                    +{inputEntries.length - 5} more
                  </span>
                )}
              </div>
            )
          : fieldNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {fieldNames.slice(0, 5).map((name) => (
                  <span
                    key={name}
                    className="px-1.5 py-1 text-xs text-muted-foreground bg-background border border-border rounded-lg"
                  >
                    {name}
                  </span>
                ))}
                {fieldNames.length > 5 && (
                  <span className="px-1.5 py-1 text-xs text-muted-foreground">
                    +{fieldNames.length - 5} more
                  </span>
                )}
              </div>
            )}
      </div>
    </div>
  );
}

function AddStepButton() {
  const { addToolStep, addCodeStep } = useWorkflowActions();
  return (
    <div className="flex gap-2 items-start px-4 pb-3">
      {/* Empty space for line number alignment */}
      <div className="w-5 shrink-0" />

      {/* Connector and Add Button */}
      <div className="flex flex-col border-1 border-transparent items-center shrink-0">
        <div className="w-px h-3 bg-border" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="size-8 rounded-lg">
              <Plus size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={addToolStep}>
              <Tool01 size={14} />
              Tool Step
            </DropdownMenuItem>
            <DropdownMenuItem onClick={addCodeStep}>
              <Code size={14} />
              Code Step
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div
          className="w-px h-8"
          style={{
            backgroundImage:
              "repeating-linear-gradient(180deg, var(--border), var(--border) 4px, transparent 4px, transparent 8px)",
            backgroundPosition: "left top",
            backgroundRepeat: "repeat-y",
            backgroundSize: "2px 100%",
          }}
        />
      </div>
    </div>
  );
}

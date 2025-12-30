import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import {
  DotsHorizontal,
  Tool01,
  Check,
  XClose,
  Loading01,
  AlertOctagon,
  Calendar,
  CoinsStacked01,
} from "@untitledui/icons";
import { Code } from "lucide-react";
import type { Step } from "@decocms/bindings/workflow";
import { useConnection } from "@/web/hooks/collections/use-connection";
import { IntegrationIcon } from "@/web/components/integration-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deco/ui/components/dropdown-menu.tsx";
import { Trash2, Copy } from "lucide-react";
import type { StepExecutionStatus } from "../hooks/derived/use-step-execution-status";

interface WorkflowStepCardProps {
  step: Step;
  index: number;
  isSelected: boolean;
  executionStatus?: StepExecutionStatus;
  isSkipped?: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export function WorkflowStepCard({
  step,
  index,
  isSelected,
  executionStatus,
  isSkipped,
  onSelect,
  onDelete,
  onDuplicate,
}: WorkflowStepCardProps) {
  const isToolStep = "toolName" in step.action;
  const connectionId =
    isToolStep && "connectionId" in step.action
      ? (step.action.connectionId as string | null)
      : null;
  const toolName =
    isToolStep && "toolName" in step.action ? step.action.toolName : null;
  const hasToolSelected = Boolean(toolName);
  const outputSchemaProperties = getOutputSchemaProperties(step);

  const status = executionStatus?.status;
  const isTracking = executionStatus !== undefined;
  const hasStatusIndicator = status === "success" || status === "error";

  // Calculate connector height based on content
  // Base height for tags if present, plus extra for status badge
  let connectorHeight = outputSchemaProperties.length > 0 ? 60 : 12;
  if (status === "success" || status === "error") {
    connectorHeight += 32; // Extra space for status badge
  }

  // Get status-based colors
  const lineNumberColor = getLineNumberColor(status);
  const connectorColor = getConnectorColor(status);

  return (
    <div
      className={cn(
        "flex gap-2 items-start border-1 border-transparent px-4 w-full rounded-lg cursor-pointer group hover:bg-accent/30",
        isSelected &&
          "bg-background border-1 border-border outline outline-offset-3 outline-border/25",
        status === "running" && "bg-accent/50",
        isSkipped && "opacity-50",
      )}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Line Number */}
      <div className="w-5 flex flex-col items-center justify-center shrink-0 pt-3">
        <span
          className={cn(
            "text-xs font-mono opacity-75 h-8 flex items-center",
            lineNumberColor,
          )}
        >
          {index + 1}.
        </span>
      </div>

      {/* Icon + Connector + Status Indicator */}
      <div className="flex flex-col items-center shrink-0">
        {index > 0 ? (
          <VerticalConnector height={12} color={connectorColor} />
        ) : (
          <div className="h-3" />
        )}
        <StepIcon
          connectionId={connectionId}
          isToolStep={isToolStep}
          hasToolSelected={hasToolSelected}
          stepName={step.name}
        />
        {/* Status indicator circle */}
        {hasStatusIndicator && (
          <>
            <VerticalConnector height={8} color={connectorColor} />
            <StatusIndicator status={status} />
          </>
        )}
        <VerticalConnector height={connectorHeight} color={connectorColor} />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 pt-3 pb-3">
        {/* Header Row */}
        <div className="flex items-center h-8">
          <span
            className={cn(
              "text-sm truncate flex-1",
              hasToolSelected
                ? "font-medium text-foreground"
                : "text-foreground",
            )}
          >
            {getStepDisplayName(step)}
          </span>

          {/* Status Icon on the right */}
          {isTracking && <HeaderStatusIcon status={status} />}

          {/* Actions Menu - only show when not tracking */}
          {!isTracking && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DotsHorizontal size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate();
                  }}
                >
                  <Copy size={14} />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive hover:bg-destructive/10! focus:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                >
                  <Trash2 size={14} className="text-destructive" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Output Schema Tags */}
        {outputSchemaProperties.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {outputSchemaProperties.map((prop) => (
              <span
                key={prop}
                className="px-1.5 py-1 text-xs text-muted-foreground bg-background border border-border rounded-lg"
              >
                {prop}
              </span>
            ))}
          </div>
        )}

        {/* Execution Status Badge */}
        {status === "success" && <SuccessBadge />}
        {status === "error" && <ErrorBadge error={executionStatus?.error} />}
      </div>
    </div>
  );
}

// Status-related helper functions
function getLineNumberColor(status?: StepExecutionStatus["status"]): string {
  switch (status) {
    case "success":
      return "text-success";
    case "error":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

function getConnectorColor(status?: StepExecutionStatus["status"]): string {
  switch (status) {
    case "success":
      return "bg-success";
    case "error":
      return "bg-destructive";
    default:
      return "bg-border";
  }
}

// Status indicator circle (checkmark or X)
function StatusIndicator({
  status,
}: {
  status?: StepExecutionStatus["status"];
}) {
  if (status === "success") {
    return (
      <div className="size-4 rounded bg-success flex items-center justify-center">
        <Check size={8} className="text-success-foreground" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="size-4 rounded bg-destructive flex items-center justify-center">
        <XClose size={8} className="text-destructive-foreground" />
      </div>
    );
  }
  return null;
}

// Header status icon (right side of header)
function HeaderStatusIcon({
  status,
}: {
  status?: StepExecutionStatus["status"];
}) {
  if (status === "success") {
    return (
      <div className="size-7 flex items-center justify-center">
        <Check size={11} className="text-success" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="size-7 flex items-center justify-center">
        <XClose size={11} className="text-destructive" />
      </div>
    );
  }
  if (status === "running") {
    return (
      <div className="size-7 flex items-center justify-center">
        <Loading01 size={11} className="text-muted-foreground animate-spin" />
      </div>
    );
  }
  return null;
}

// Success badge showing date/time and cost
function SuccessBadge() {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().split(" ")[0];

  return (
    <div className="inline-flex items-center gap-3 px-1.5 py-1 bg-success-foreground rounded-lg w-fit">
      <div className="flex items-center gap-1.5">
        <Calendar size={16} className="text-success" />
        <span className="text-xs text-success">{dateStr}</span>
        <span className="text-xs text-success">{timeStr}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <CoinsStacked01 size={16} className="text-success" />
        <span className="text-xs text-success">—</span>
      </div>
    </div>
  );
}

// Error badge showing error message
function ErrorBadge({ error }: { error?: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-1.5 py-1 bg-destructive-foreground rounded-lg w-fit">
      <AlertOctagon size={16} className="text-destructive" />
      <span className="text-xs text-destructive">
        {error || "Execution failed"}
      </span>
    </div>
  );
}

function StepIcon({
  connectionId,
  isToolStep,
  hasToolSelected,
  stepName,
}: {
  connectionId: string | null;
  isToolStep: boolean;
  hasToolSelected: boolean;
  stepName: string;
}) {
  const connection = useConnection(connectionId ?? "");

  if (isToolStep && hasToolSelected && connection?.icon) {
    return (
      <div className="size-8 rounded-lg border border-border/10 bg-background shadow-sm flex items-center justify-center overflow-hidden">
        <IntegrationIcon
          icon={connection.icon}
          name={stepName}
          size="xs"
          className="border-0 rounded-none"
        />
      </div>
    );
  }

  return (
    <div className="size-8 rounded-lg border border-border/10 bg-background shadow-sm flex items-center justify-center">
      {isToolStep ? (
        <Tool01 size={16} className="text-muted-foreground" />
      ) : (
        <Code size={16} className="text-muted-foreground" />
      )}
    </div>
  );
}

function VerticalConnector({
  height,
  color = "bg-border",
}: {
  height: number;
  color?: string;
}) {
  return <div className={cn("w-px", color)} style={{ height }} />;
}

function getStepDisplayName(step: Step): string {
  if ("toolName" in step.action && step.action.toolName) {
    return step.action.toolName;
  }
  if ("code" in step.action) {
    return step.name || "Code Step";
  }
  return "Select tool...";
}

function getOutputSchemaProperties(step: Step): string[] {
  const schema = step.outputSchema;
  if (!schema || typeof schema !== "object") return [];

  const properties = (schema as Record<string, unknown>).properties;
  if (!properties || typeof properties !== "object") return [];

  // Get top-level property names
  return Object.keys(properties as Record<string, unknown>).slice(0, 5);
}

import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { DotsHorizontal, Tool01 } from "@untitledui/icons";
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

interface WorkflowStepCardProps {
  step: Step;
  index: number;
  isSelected: boolean;
  isLast: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function WorkflowStepCard({
  step,
  index,
  isSelected,
  isLast,
  onSelect,
  onDelete,
}: WorkflowStepCardProps) {
  const isToolStep = "toolName" in step.action;
  const connectionId =
    isToolStep && "connectionId" in step.action
      ? step.action.connectionId
      : null;
  const toolName =
    isToolStep && "toolName" in step.action ? step.action.toolName : null;
  const hasToolSelected = Boolean(toolName);
  const outputSchemaProperties = getOutputSchemaProperties(step);

  return (
    <div
      className={cn(
        "flex gap-2 items-start px-4 w-full rounded-lg",
        isSelected && "bg-muted/50",
      )}
    >
      {/* Line Number */}
      <div className="w-5 flex flex-col items-center justify-center shrink-0 pt-3">
        <span className="text-xs font-mono text-muted-foreground/75 h-8 flex items-center">
          {index + 1}.
        </span>
      </div>

      {/* Icon + Connector */}
      <div className="flex flex-col items-center shrink-0 pt-3">
        <StepIcon
          connectionId={connectionId}
          isToolStep={isToolStep}
          hasToolSelected={hasToolSelected}
          stepName={step.name}
        />
        {!isLast && <VerticalConnector height={hasToolSelected ? 100 : 12} />}
      </div>

      {/* Content */}
      <div
        className={cn(
          "flex-1 flex flex-col gap-3 min-w-0 pt-3 pb-0 cursor-pointer group",
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

          {/* Actions Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <DotsHorizontal size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Copy size={14} />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 size={14} />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
      </div>
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

function VerticalConnector({ height }: { height: number }) {
  return <div className="w-px bg-border" style={{ height }} />;
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

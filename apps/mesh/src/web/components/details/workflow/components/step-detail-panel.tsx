import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@deco/ui/components/accordion.tsx";
import { Button } from "@deco/ui/components/button.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { CornerDownRight, Plus, Repeat03 } from "@untitledui/icons";
import {
  Box,
  Braces,
  CheckSquare,
  FileText,
  Hash,
  Minus,
  Type,
  X,
} from "lucide-react";
import { IntegrationIcon } from "@/web/components/integration-icon";
import {
  useCurrentStep,
  useTrackingExecutionId,
  useWorkflowActions,
} from "../stores/workflow";
import { ToolInput } from "./tool-selection/components/tool-input";
import type { JsonSchema } from "@/web/utils/constants";
import { MonacoCodeEditor } from "./monaco-editor";
import type { Step } from "@decocms/bindings/workflow";
import { useMcp } from "@/web/hooks/use-mcp";
import { usePollingWorkflowExecution } from "../hooks";

interface StepDetailPanelProps {
  className?: string;
}

/**
 * Hook to sync step outputSchema from tool outputSchema.
 * If the step has a tool but no outputSchema, set it from the tool.
 */
function useSyncOutputSchema(step: Step | undefined) {
  const { updateStep } = useWorkflowActions();

  const isToolStep = step && "toolName" in step.action;
  const toolName =
    isToolStep && "toolName" in step.action ? step.action.toolName : null;

  const { tool } = useGatewayTool("gw_NVZj-H9VxwOMRt-1M6Ntf", toolName ?? "");

  // Check if step has a tool but outputSchema is empty or missing
  const hasToolWithNoOutputSchema =
    step &&
    toolName &&
    tool?.outputSchema &&
    (!step.outputSchema || Object.keys(step.outputSchema).length === 0);

  // Sync on first render if needed (runs once when condition is met)
  if (hasToolWithNoOutputSchema) {
    // Use queueMicrotask to avoid updating state during render
    queueMicrotask(() => {
      updateStep(step.name, {
        outputSchema: tool.outputSchema,
      });
    });
  }
}

export function StepDetailPanel({ className }: StepDetailPanelProps) {
  const currentStep = useCurrentStep();

  // Sync outputSchema from tool if step has tool but no outputSchema
  useSyncOutputSchema(currentStep);

  if (!currentStep) {
    return (
      <div className={cn("flex flex-col h-full bg-sidebar", className)}>
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Select a step to configure
        </div>
      </div>
    );
  }

  const isToolStep = "toolName" in currentStep.action;
  const hasToolSelected =
    isToolStep &&
    "toolName" in currentStep.action &&
    currentStep.action.toolName;

  if (!hasToolSelected) {
    return (
      <div className={cn("flex flex-col h-full bg-sidebar", className)}>
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Select a tool to configure this step
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col h-full bg-sidebar overflow-auto", className)}
    >
      <StepHeader step={currentStep} />
      <InputSection step={currentStep} />
      <OutputSection step={currentStep} />
      <TransformCodeSection step={currentStep} />
    </div>
  );
}

// ============================================================================
// Step Header
// ============================================================================

function StepHeader({ step }: { step: Step }) {
  const { updateStep, startReplacingTool } = useWorkflowActions();
  const isToolStep = "toolName" in step.action;
  const toolName =
    isToolStep && "toolName" in step.action ? step.action.toolName : null;

  const handleReplace = () => {
    // Store current tool info for back button
    if (toolName) {
      startReplacingTool(toolName);
    }
    // Clear tool selection to show MCP server selector
    updateStep(step.name, {
      action: {
        ...step.action,
        toolName: "",
      },
    });
  };

  return (
    <div className="border-b border-border p-5 shrink-0">
      <div className="flex items-center gap-2">
        <IntegrationIcon
          icon={null}
          name={toolName ?? ""}
          size="xs"
          className="shadow-sm"
        />
        <span className="text-base font-medium text-foreground truncate flex-1">
          {toolName}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={handleReplace}
          title="Replace tool"
        >
          <Repeat03 size={14} />
        </Button>
      </div>
      {step.description && (
        <p className="text-sm text-muted-foreground">{step.description}</p>
      )}
    </div>
  );
}

export function useGatewayTool(
  gatewayId: string | undefined,
  toolName: string,
) {
  const mcpProxyUrl = gatewayId
    ? new URL(`/mcp/gateway/${gatewayId}`, window.location.origin).href
    : "";

  const mcp = useMcp({ url: mcpProxyUrl, enabled: !!gatewayId });

  const tool = mcp.tools?.find((t) => t.name === toolName);

  return {
    tool,
    isLoading: mcp.state === "connecting",
    isReady: mcp.state === "ready",
    error: mcp.error,
  };
}

// ============================================================================
// Input Section
// ============================================================================

function InputSection({ step }: { step: Step }) {
  const { updateStep } = useWorkflowActions();
  const isToolStep = "toolName" in step.action;
  const toolName =
    isToolStep && "toolName" in step.action ? step.action.toolName : null;

  const { tool } = useGatewayTool("gw_NVZj-H9VxwOMRt-1M6Ntf", toolName ?? "");

  if (!tool || !tool.inputSchema) {
    return null;
  }

  const handleInputChange = (formData: Record<string, unknown>) => {
    updateStep(step.name, {
      input: formData,
    });
  };

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue="input"
      className="border-b border-border shrink-0"
    >
      <AccordionItem value="input" className="border-b-0">
        <AccordionTrigger className="px-5 py-5">
          <span className="text-sm font-medium text-muted-foreground">
            Input
          </span>
        </AccordionTrigger>
        <AccordionContent className="px-5 pt-2">
          <ToolInput
            inputSchema={tool.inputSchema as JsonSchema}
            inputParams={step.input as Record<string, unknown>}
            setInputParams={handleInputChange}
            mentions={[]}
          />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

// ============================================================================
// Output Section
// ============================================================================

function OutputSection({ step }: { step: Step }) {
  const outputSchema = step.outputSchema;
  const trackingExecutionId = useTrackingExecutionId();
  const { step_results } = usePollingWorkflowExecution(trackingExecutionId);
  const stepResult = step_results?.find(
    (result) => result.step_id === step.name,
  );
  const output = stepResult?.output;

  console.log("output", output);

  // Always show the Output section (even if empty)
  const properties =
    outputSchema && typeof outputSchema === "object"
      ? ((outputSchema as Record<string, unknown>).properties as
          | Record<string, unknown>
          | undefined)
      : undefined;

  const propertyEntries = properties ? Object.entries(properties) : [];

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue="output"
      className="border-b border-border shrink-0"
    >
      <AccordionItem value="output" className="border-b-0">
        <AccordionTrigger className="px-5 py-5">
          <span className="text-sm font-medium text-muted-foreground">
            Output
          </span>
        </AccordionTrigger>
        <AccordionContent className="px-5 pt-2">
          {propertyEntries.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">
              No output schema defined
            </div>
          ) : output ? (
            <MonacoCodeEditor
              code={JSON.stringify(output, null, 2)}
              language="json"
              height={200}
            />
          ) : (
            <div className="space-y-2">
              {propertyEntries.map(([key, propSchema]) => (
                <OutputProperty
                  key={key}
                  name={key}
                  schema={propSchema as JsonSchema}
                />
              ))}
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function getTypeIcon(type: string) {
  switch (type) {
    case "string":
      return { Icon: Type, color: "text-blue-500" };
    case "number":
    case "integer":
      return { Icon: Hash, color: "text-blue-500" };
    case "array":
      return { Icon: Braces, color: "text-purple-500" };
    case "object":
      return { Icon: Box, color: "text-orange-500" };
    case "boolean":
      return { Icon: CheckSquare, color: "text-pink-500" };
    case "null":
      return { Icon: X, color: "text-gray-500" };
    default:
      return { Icon: FileText, color: "text-muted-foreground" };
  }
}

function OutputProperty({
  name,
  schema,
}: {
  name: string;
  schema: JsonSchema;
}) {
  const currentStep = useCurrentStep();
  const type = schema.type ?? "unknown";
  const { Icon, color } = getTypeIcon(type);

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 flex items-center gap-2">
        <Icon size={14} className={cn(color)} />
        <span className="text-sm font-medium text-foreground">{name}</span>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <CornerDownRight size={14} className="opacity-50" />
        <span className="text-muted-foreground">{currentStep?.name}.</span>
        <div className="bg-blue-500/10 text-blue-500 px-1 py-0.5 rounded">
          {name}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Transform Code Section
// ============================================================================

function TransformCodeSection({ step }: { step: Step }) {
  const { updateStep } = useWorkflowActions();

  const isToolStep = "toolName" in step.action;
  const toolName =
    isToolStep && "toolName" in step.action ? step.action.toolName : null;

  const { tool } = useGatewayTool("gw_NVZj-H9VxwOMRt-1M6Ntf", toolName ?? "");

  const transformCode =
    isToolStep && "transformCode" in step.action
      ? (step.action.transformCode ?? null)
      : null;

  const hasTransformCode = Boolean(transformCode);

  // Generate Input interface from tool's output schema
  const generateInputInterface = (): string => {
    if (!tool?.outputSchema) {
      return "interface Input {\n  // Tool output schema not available\n}";
    }

    const schema = tool.outputSchema as JsonSchema;
    const properties = schema.properties as
      | Record<string, JsonSchema>
      | undefined;

    if (!properties) {
      return "interface Input {\n  [key: string]: unknown;\n}";
    }

    const fields = Object.entries(properties)
      .map(([key, prop]) => {
        const type = jsonSchemaTypeToTS(prop);
        const optional = !(schema.required as string[] | undefined)?.includes(
          key,
        );
        return `  ${key}${optional ? "?" : ""}: ${type};`;
      })
      .join("\n");

    return `interface Input {\n${fields}\n}`;
  };

  const handleAddTransformCode = () => {
    const inputInterface = generateInputInterface();
    const defaultCode = `${inputInterface}

interface Output {
  // Define your output type here
  result: unknown;
}

export default async function(input: Input): Promise<Output> {
  // Transform the tool output
  return {
    result: input,
  };
}`;

    updateStep(step.name, {
      action: {
        ...step.action,
        transformCode: defaultCode,
      },
    });
  };

  const handleRemoveTransformCode = () => {
    updateStep(step.name, {
      action: {
        ...step.action,
        transformCode: undefined,
      },
    });
  };

  const handleCodeSave = (
    code: string,
    outputSchema: Record<string, unknown> | null,
  ) => {
    // Update both the transform code and the output schema
    updateStep(step.name, {
      action: {
        ...step.action,
        transformCode: code,
      },
      // If we extracted an output schema from the TypeScript, use it
      ...(outputSchema ? { outputSchema } : {}),
    });
  };

  // No transform code → show collapsed with Plus
  if (!hasTransformCode) {
    return (
      <div
        className="border-b border-border p-5 shrink-0 cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={handleAddTransformCode}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">
            Transform Code
          </h3>
          <Plus size={14} className="text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Has transform code → show editor with Minus to remove
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div
        className="p-5 shrink-0 cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={handleRemoveTransformCode}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground">
            Transform Code
          </h3>
          <Minus size={14} className="text-muted-foreground" />
        </div>
      </div>
      <div className="flex-1 min-h-120">
        <MonacoCodeEditor
          code={transformCode!}
          language="typescript"
          onSave={handleCodeSave}
          height="100%"
        />
      </div>
    </div>
  );
}

// Helper function to convert JSON Schema types to TypeScript types
function jsonSchemaTypeToTS(schema: JsonSchema): string {
  if (Array.isArray(schema.type)) {
    return schema.type
      .map((t) => jsonSchemaTypeToTS({ ...schema, type: t }))
      .join(" | ");
  }

  const type = schema.type as string | undefined;

  switch (type) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      if (schema.items) {
        const itemType = jsonSchemaTypeToTS(schema.items as JsonSchema);
        return `${itemType}[]`;
      }
      return "unknown[]";
    case "object":
      if (schema.properties) {
        const props = Object.entries(
          schema.properties as Record<string, JsonSchema>,
        )
          .map(([key, prop]) => {
            const propType = jsonSchemaTypeToTS(prop);
            const optional = !(
              schema.required as string[] | undefined
            )?.includes(key);
            return `${key}${optional ? "?" : ""}: ${propType}`;
          })
          .join("; ");
        return `{ ${props} }`;
      }
      return "Record<string, unknown>";
    case "null":
      return "null";
    default:
      return "unknown";
  }
}

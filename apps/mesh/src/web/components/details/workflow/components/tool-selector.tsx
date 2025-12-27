import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { ListRow } from "@/web/components/list-row.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { ArrowLeft, Copy } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { createToolCaller } from "@/tools/client";
import { useConnection } from "@/web/hooks/collections/use-connection";

import { Button } from "@deco/ui/components/button.tsx";
import { Box, Clock, Database, Loader2, Play } from "lucide-react";
import { useMcp } from "@/web/hooks/use-mcp";
import { JsonSchema } from "@/web/utils/constants";
import {
  MentionInput,
  MentionItem,
} from "@/web/components/tiptap-mentions-input";
import { usePollingWorkflowExecution } from "../hooks/use-workflow-collection-item";
import { useCurrentStepName, useTrackingExecutionId } from "../stores/workflow";
import { MonacoCodeEditor } from "./monaco-editor";
import { toast } from "@deco/ui/components/sonner.tsx";

// RJSF imports
import Form from "@rjsf/core";
import type {
  FieldTemplateProps,
  ObjectFieldTemplateProps,
  ArrayFieldTemplateProps,
  WidgetProps,
  RegistryWidgetsType,
  TemplatesType,
  RJSFSchema,
} from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";

// --- RJSF Context for Mentions ---

const MentionsContext = createContext<MentionItem[]>([]);

function useMentions() {
  return useContext(MentionsContext);
}

export function ItemCard({
  item,
  selected,
  onClick,
  backButton = false,
}: {
  item: { icon: string | null; title: string };
  selected?: boolean;
  backButton?: boolean;
  onClick?: () => void;
}) {
  return (
    <ListRow
      className={cn("border-b border-border/50 h-12", backButton && "p-0")}
      selected={selected}
      onClick={onClick}
    >
      {backButton && (
        <div className="flex h-full px-2 border-r items-center">
          <Button
            variant="ghost"
            size="icon"
            className="items-center size-8 text-muted-foreground/50"
            onClick={onClick}
          >
            <ArrowLeft />
          </Button>
        </div>
      )}
      {item.icon !== null && (
        <ListRow.Icon>
          <IntegrationIcon
            icon={item.icon ?? null}
            name={item.title}
            size="sm"
          />
        </ListRow.Icon>
      )}
      <ListRow.Content>
        <ListRow.Title className="text-muted-foreground/70">
          {item.title}
        </ListRow.Title>
      </ListRow.Content>
    </ListRow>
  );
}

function useToolState(
  inputSchema: JsonSchema,
  defaultInputParams?: Record<string, unknown>,
) {
  const resolvedInputParams = useToolInputParams(
    inputSchema,
    defaultInputParams ?? {},
  );
  const [inputParams, setInputParams] =
    useState<Record<string, unknown>>(resolvedInputParams);
  const [executionResult, setExecutionResult] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [stats, setStats] = useState<{
    duration: string;
    tokens?: string;
    bytes?: string;
    cost?: string;
  } | null>(null);
  return {
    inputParams,
    setInputParams,
    executionResult,
    setExecutionResult,
    executionError,
    setExecutionError,
    isExecuting,
    setIsExecuting,
    stats,
    setStats,
  };
}

const generateDefaultValue = (
  schema: JsonSchema,
  onlyRequired = true,
): unknown => {
  if (!schema) return "";

  // Handle union types (anyOf/oneOf) - use the first schema that looks like an object or the first one
  if (schema.anyOf || schema.oneOf) {
    const unionSchemas = (schema.anyOf || schema.oneOf) as JsonSchema[];
    // Prefer object type schemas, then array, then fall back to first
    const objectSchema = unionSchemas.find((s) => s.type === "object");
    const arraySchema = unionSchemas.find((s) => s.type === "array");
    const schemaToUse = objectSchema || arraySchema || unionSchemas[0];
    if (schemaToUse) {
      return generateDefaultValue(schemaToUse, onlyRequired);
    }
  }

  // If schema has properties but no explicit type, treat as object
  if (!schema.type && schema.properties) {
    const obj: Record<string, unknown> = {};
    const requiredKeys = schema.required ?? [];
    Object.entries(schema.properties).forEach(([key, propSchema]) => {
      if (!onlyRequired || requiredKeys.includes(key)) {
        obj[key] = generateDefaultValue(propSchema as JsonSchema, false);
      }
    });
    return obj;
  }

  switch (schema.type) {
    case "object": {
      const obj: Record<string, unknown> = {};
      if (schema.properties) {
        const requiredKeys = schema.required ?? [];
        Object.entries(schema.properties).forEach(([key, propSchema]) => {
          // Only include required fields when onlyRequired is true
          if (!onlyRequired || requiredKeys.includes(key)) {
            // For nested objects, always include required properties (pass false for deeper nesting)
            obj[key] = generateDefaultValue(propSchema as JsonSchema, false);
          }
        });
      }
      return obj;
    }
    case "array": {
      // Return empty array - don't pre-populate with items
      return [];
    }
    case "number":
    case "integer": {
      return 0;
    }
    case "boolean": {
      return false;
    }
    case "string":
    default: {
      return "";
    }
  }
};

const generateInitialParams = (
  inputSchema: JsonSchema,
): Record<string, unknown> => {
  const initialParams: Record<string, unknown> = {};
  const inputSchemaProperties = inputSchema?.properties;
  const requiredKeys = inputSchema?.required ?? [];
  if (inputSchemaProperties) {
    Object.entries(inputSchemaProperties).forEach(([key, propSchema]) => {
      // Only include required fields at the top level
      if (requiredKeys.includes(key)) {
        initialParams[key] = generateDefaultValue(
          propSchema as JsonSchema,
          true,
        );
      }
    });
  }
  return initialParams;
};

export function useTool(toolName: string, connectionId: string) {
  const connection = useConnection(connectionId);
  const mcpProxyUrl = new URL(`/mcp/${connectionId}`, window.location.origin);

  // Initialize MCP client
  const mcp = useMcp({
    url: mcpProxyUrl.href,
  });

  // Find the tool definition
  const tool = mcp.tools?.find((t) => t.name === toolName);

  // Check if MCP is still loading/discovering
  const isLoading =
    mcp.state === "disconnected" ||
    mcp.state === "connecting" ||
    mcp.state === "error";

  return {
    tool,
    mcp,
    connection,
    isLoading,
  };
}

function useToolInputParams(
  inputSchema: JsonSchema,
  initialInputParams?: Record<string, unknown>,
) {
  return initialInputParams ?? generateInitialParams(inputSchema);
}

export function useResolvedRefs() {
  const trackingExecutionId = useTrackingExecutionId();
  const { step_results, item: executionItem } =
    usePollingWorkflowExecution(trackingExecutionId);
  const resolvedRefs: Record<string, unknown> | undefined =
    trackingExecutionId && step_results
      ? (() => {
          const refs: Record<string, unknown> = {};
          // Add workflow input as "input"
          if (executionItem?.input) {
            refs["input"] = executionItem.input;
          }
          // Add each step's output by step_id
          for (const result of step_results) {
            if (result.step_id && result.output !== undefined) {
              refs[result.step_id as string] = result.output;
            }
          }
          return refs;
        })()
      : undefined;
  return resolvedRefs;
}

export function ToolComponent({
  tool,
  initialInputParams,
  connection,
  onInputChange,
  mentions,
  mcp,
}: {
  tool: NonNullable<ReturnType<typeof useTool>["tool"]>;
  initialInputParams?: Record<string, unknown>;
  connection: ReturnType<typeof useTool>["connection"];
  onInputChange?: (input: Record<string, unknown>) => void;
  mentions?: MentionItem[];
  mcp: ReturnType<typeof useTool>["mcp"];
}) {
  const {
    inputParams,
    setInputParams,
    executionResult: executionResultFromTool,
    setExecutionResult,
    setExecutionError,
    isExecuting,
    setIsExecuting,
    stats,
    setStats,
  } = useToolState(tool.inputSchema as JsonSchema, initialInputParams);
  const trackingExecutionId = useTrackingExecutionId();
  const currentStepName = useCurrentStepName();
  const { step_results } = usePollingWorkflowExecution(trackingExecutionId);
  const stepResult = step_results?.find(
    (step) => step.step_id === currentStepName,
  );
  const executionResult = stepResult ?? executionResultFromTool;

  // Build resolved refs from step results and workflow input for hover tooltips

  const handleExecute = async () => {
    setIsExecuting(true);
    setExecutionError(null);
    setExecutionResult(null);
    setStats(null);

    const startTime = performance.now();
    const toolCaller = createToolCaller(connection?.id ?? undefined);

    try {
      // Prepare arguments: try to parse JSON for object/array types
      const args = { ...inputParams };
      if (tool?.inputSchema?.properties) {
        Object.entries(tool?.inputSchema.properties).forEach(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ([key, prop]: [string, any]) => {
            const required = tool?.inputSchema?.required?.includes(key);
            const notRequiredAndEmpty = !required && !args[key];
            if (notRequiredAndEmpty) {
              delete args[key];
              return;
            }
            if (
              (prop.type === "object" || prop.type === "array") &&
              typeof args[key] === "string"
            ) {
              try {
                args[key] = JSON.parse(args[key]);
              } catch {
                // Parsing failed, send as string (will likely fail validation but let server handle it)
              }
            }
          },
        );
      }

      const result = await toolCaller(tool.name, args);

      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);

      setExecutionResult(result as Record<string, unknown>);

      // Calculate mocked stats based on result size
      const resultStr = JSON.stringify(result);
      const bytes = new TextEncoder().encode(resultStr).length;

      setStats({
        duration: `${durationMs}ms`,
        bytes: `${bytes} bytes`,
        // Mocking tokens/cost as we don't have real data for that yet
        tokens: `~${Math.ceil(bytes / 4)} tokens`,
        cost: "$0.0000",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setExecutionError(message || "Unknown error occurred");
      const endTime = performance.now();
      setStats({
        duration: `${Math.round(endTime - startTime)}ms`,
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleInputChange = (key: string, value: unknown) => {
    setInputParams((prev) => ({ ...prev, [key]: value }));
    onInputChange?.({ [key]: value });
  };

  if (!connection) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex flex-col items-center w-full h-full mx-auto pt-2 px-2">
        {/* Tool Title & Description */}
        <div className="flex flex-col items-center gap-2 text-center pb-2">
          <h1 className="text-2xl font-medium text-foreground">{tool.name}</h1>
          <p className="text-muted-foreground text-sm">
            {tool?.description || "No description available"}
          </p>
        </div>

        {/* Stats Row */}
        {!trackingExecutionId && (
          <div className="flex items-center gap-4 py-2 shrink-0">
            {/* MCP Status */}
            <div className="flex items-center gap-2">
              {mcp.state === "ready" ? (
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              ) : mcp.state === "connecting" ? (
                <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />
              ) : (
                <div className="h-2 w-2 rounded-full bg-red-500" />
              )}
              <span className="font-mono text-sm capitalize text-muted-foreground">
                {mcp.state.replace("_", " ")}
              </span>
            </div>

            {/* Execution Stats */}
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono text-sm">
                {stats?.duration || "-"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Box className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono text-sm">{stats?.tokens || "-"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono text-sm">{stats?.bytes || "-"}</span>
            </div>
          </div>
        )}
      </div>
      <div className="w-full h-full flex flex-col">
        <div className="h-10 flex items-center justify-between px-4 py-2 border-y border-border">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-sm bg-primary/10 flex items-center justify-center">
              <Play className="h-3 w-3 text-primary" />
            </div>
            <span className="font-medium text-sm">Input</span>
          </div>
          {!trackingExecutionId && (
            <Button
              size="sm"
              variant="default"
              className="h-8 gap-2"
              onClick={handleExecute}
              disabled={isExecuting}
            >
              {isExecuting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" />
              )}
              Execute tool
            </Button>
          )}
        </div>

        <div className="pb-8">
          <div className="p-4 space-y-4">
            <ToolInput
              inputSchema={tool?.inputSchema as JsonSchema}
              inputParams={inputParams}
              readOnly={trackingExecutionId ? true : undefined}
              setInputParams={setInputParams}
              handleInputChange={handleInputChange}
              mentions={mentions ?? []}
            />
          </div>
          {executionResult && (
            <ExecutionResult executionResult={executionResult} />
          )}
        </div>
      </div>
    </div>
  );
}

export function ExecutionResult({
  executionResult,
}: {
  executionResult: Record<string, unknown> | null;
}) {
  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(executionResult, null, 2));
    toast.success("Copied to clipboard");
  };
  return (
    <div className="w-full shadow-sm h-full border-t border-border">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b border-border">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
          Execution Result
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={handleCopy}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>

      <MonacoCodeEditor
        code={JSON.stringify(executionResult, null, 2)}
        language="json"
        readOnly
        foldOnMount
      />
    </div>
  );
}

// --- RJSF Custom Templates ---

/**
 * Custom FieldTemplate - wraps each field with label, description, and type indicator
 */
function CustomFieldTemplate(props: FieldTemplateProps) {
  const { id, label, required, description, children, schema, hidden } = props;

  if (hidden) return <div className="hidden">{children}</div>;

  // Don't show label/description for root object
  if (id === "root") {
    return <div className="space-y-4">{children}</div>;
  }

  const schemaType = Array.isArray(schema.type)
    ? schema.type.join(" | ")
    : (schema.type ?? "string");

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <label htmlFor={id} className="text-sm font-medium leading-none">
          {label}
        </label>
        {required && <span className="text-red-500 text-xs">*</span>}
        <span className="text-xs text-muted-foreground ml-auto">
          {schemaType}
        </span>
      </div>
      {description && (
        <div className="text-xs text-muted-foreground mb-1">{description}</div>
      )}
      {children}
    </div>
  );
}

/**
 * Custom ObjectFieldTemplate - renders nested objects with left border indent
 */
function CustomObjectFieldTemplate(props: ObjectFieldTemplateProps) {
  const { properties, title } = props;
  // Use title to determine if root - root usually has no title or "Root"
  const isRoot = !title || title === "Root";

  // Root object - no wrapper
  if (isRoot) {
    return (
      <div className="space-y-4">
        {properties.map((prop) => (
          <div key={prop.name}>{prop.content}</div>
        ))}
      </div>
    );
  }

  // Nested object - show with left border
  return (
    <div className="pl-4 border-l-2 border-border/50 space-y-4">
      {properties.map((prop) => (
        <div key={prop.name}>{prop.content}</div>
      ))}
    </div>
  );
}

/**
 * Custom ArrayFieldTemplate - renders arrays with add/remove controls
 */
function CustomArrayFieldTemplate(props: ArrayFieldTemplateProps) {
  const { items, canAdd, onAddClick, title } = props;

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={(item as any).key || (item as any).index}
            className="flex gap-2 items-start"
          >
            <div className="flex-1">{item}</div>
          </div>
        ))}
      </div>
      {canAdd && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={onAddClick}
        >
          + Add {title || "item"}
        </Button>
      )}
    </div>
  );
}

// --- RJSF Custom Widgets ---

/**
 * Text widget using MentionInput
 */
function MentionTextWidget(props: WidgetProps) {
  const { value, onChange, placeholder, readonly } = props;
  const mentions = useMentions();

  return (
    <MentionInput
      mentions={mentions}
      value={value ?? ""}
      onChange={(v) => onChange(v)}
      placeholder={placeholder || `Enter value...`}
      readOnly={readonly}
    />
  );
}

/**
 * Textarea widget using MentionInput with multiline styling
 */
function MentionTextareaWidget(props: WidgetProps) {
  const { value, onChange, placeholder, readonly } = props;
  const mentions = useMentions();

  return (
    <MentionInput
      mentions={mentions}
      value={value ?? ""}
      onChange={(v) => onChange(v)}
      placeholder={placeholder || `Enter value...`}
      readOnly={readonly}
      className="min-h-[80px]"
    />
  );
}

/**
 * Number widget
 */
function NumberWidget(props: WidgetProps) {
  const { value, onChange, readonly, id } = props;

  return (
    <input
      id={id}
      type="number"
      value={value ?? ""}
      onChange={(e) =>
        onChange(e.target.value === "" ? undefined : Number(e.target.value))
      }
      disabled={readonly}
      className={cn(
        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
        "ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    />
  );
}

/**
 * Checkbox widget
 */
function CheckboxWidget(props: WidgetProps) {
  const { value, onChange, readonly, id, label } = props;

  return (
    <label htmlFor={id} className="flex items-center gap-2 cursor-pointer">
      <input
        id={id}
        type="checkbox"
        checked={value ?? false}
        onChange={(e) => onChange(e.target.checked)}
        disabled={readonly}
        className="h-4 w-4 rounded border-input"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}

/**
 * Select widget
 */
function SelectWidget(props: WidgetProps) {
  const { value, onChange, readonly, id, options } = props;
  const enumOptions = options.enumOptions ?? [];

  return (
    <select
      id={id}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={readonly}
      className={cn(
        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
        "ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <option value="">Select...</option>
      {enumOptions.map((opt) => (
        <option key={String(opt.value)} value={String(opt.value)}>
          {String(opt.label)}
        </option>
      ))}
    </select>
  );
}

// Custom widgets registry
const customWidgets: RegistryWidgetsType = {
  TextWidget: MentionTextWidget,
  TextareaWidget: MentionTextareaWidget,
  NumberWidget: NumberWidget,
  CheckboxWidget: CheckboxWidget,
  SelectWidget: SelectWidget,
};

/**
 * Custom UnsupportedFieldTemplate - hides unsupported field errors
 */
function CustomUnsupportedFieldTemplate() {
  // Return null to hide unsupported field errors
  return null;
}

/**
 * Custom ErrorListTemplate - hides the error list at the top of the form
 */
function CustomErrorListTemplate() {
  // Return null to hide error list
  return null;
}

// Custom templates registry
const customTemplates: Partial<TemplatesType> = {
  FieldTemplate: CustomFieldTemplate,
  ObjectFieldTemplate: CustomObjectFieldTemplate,

  ArrayFieldTemplate: CustomArrayFieldTemplate,
  UnsupportedFieldTemplate: CustomUnsupportedFieldTemplate,
  ErrorListTemplate: CustomErrorListTemplate,
};

// --- Readonly View Component ---

/**
 * Renders a clean readonly view of form data with mention tooltips
 */
function ReadonlyToolInput({
  inputSchema,
  inputParams,
  mentions,
}: {
  inputSchema: JsonSchema;
  inputParams?: Record<string, unknown>;
  mentions: MentionItem[];
}) {
  if (!inputSchema?.properties || !inputParams) {
    return null;
  }

  const renderValue = (key: string, value: unknown, schema: JsonSchema) => {
    // Convert value to string for display
    const valueStr =
      typeof value === "object" && value !== null
        ? JSON.stringify(value, null, 2)
        : String(value ?? "");

    const schemaType = Array.isArray(schema.type)
      ? schema.type.join(" | ")
      : (schema.type ?? "string");

    return (
      <div key={key} className="space-y-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">{key}</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {schemaType}
          </span>
        </div>
        {schema.description && (
          <div className="text-xs text-muted-foreground">
            {schema.description}
          </div>
        )}
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <MentionInput
            mentions={mentions}
            value={valueStr}
            readOnly
            className="border-0 bg-transparent p-0"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {Object.entries(inputSchema.properties).map(([key, propSchema]) => {
        const value = inputParams[key];
        return renderValue(key, value, propSchema as JsonSchema);
      })}
    </div>
  );
}

// --- ToolInput Component using RJSF ---
function ToolInput({
  inputSchema,
  inputParams,
  setInputParams,
  handleInputChange,
  mentions,
  readOnly,
}: {
  inputSchema: JsonSchema;
  inputParams?: Record<string, unknown>;
  setInputParams?: (params: Record<string, unknown>) => void;
  handleInputChange?: (key: string, value: unknown) => void;
  mentions?: MentionItem[];
  readOnly?: boolean | undefined;
}) {
  const mentionItems = mentions ?? [];

  if (!inputSchema) {
    return (
      <div className="text-sm text-muted-foreground italic">
        No arguments defined in schema.
      </div>
    );
  }

  // If readonly, use the clean readonly view
  if (readOnly) {
    return (
      <ReadonlyToolInput
        inputSchema={inputSchema}
        inputParams={inputParams}
        mentions={mentionItems}
      />
    );
  }

  // Convert JsonSchema to RJSFSchema
  const rjsfSchema: RJSFSchema = inputSchema as RJSFSchema;

  const handleChange = (data: { formData?: Record<string, unknown> }) => {
    const formData = data.formData ?? {};
    setInputParams?.(formData);

    // Call handleInputChange for each changed key
    if (handleInputChange) {
      for (const [key, value] of Object.entries(formData)) {
        handleInputChange(key, value);
      }
    }
  };

  return (
    <MentionsContext.Provider value={mentionItems}>
      <Form
        schema={rjsfSchema}
        formData={inputParams}
        onChange={handleChange}
        validator={validator}
        widgets={customWidgets}
        templates={customTemplates}
        readonly={readOnly}
        uiSchema={{
          "ui:submitButtonOptions": { norender: true },
        }}
        liveValidate={false}
        // showErrorList={false}
        // noHtml5Validate
        className="rjsf-form"
        omitExtraData
        liveOmit
      >
        {/* Empty children to hide submit button */}
        <></>
      </Form>
    </MentionsContext.Provider>
  );
}

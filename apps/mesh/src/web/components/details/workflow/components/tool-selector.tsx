import { IntegrationIcon } from "@/web/components/integration-icon.tsx";
import { ListRow } from "@/web/components/list-row.tsx";
import { cn } from "@deco/ui/lib/utils.ts";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { createToolCaller } from "@/tools/client";
import { useConnection } from "@/web/hooks/collections/use-connection";

import { Button } from "@deco/ui/components/button.tsx";
import {
  Box,
  Clock,
  Code,
  Copy,
  Database,
  Loader2,
  Play,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { useMcp } from "@/web/hooks/use-mcp";
import { JsonSchema } from "@/web/utils/constants";
import { ScrollArea } from "@deco/ui/components/scroll-area.js";
import {
  MentionInput,
  MentionItem,
} from "@/web/components/tiptap-mentions-input";

export function ItemCard({
  item,
  selected,
  backButton = false,
  onClick,
}: {
  item: { icon: string | null; title: string };
  selected?: boolean;
  backButton?: boolean;
  onClick?: () => void;
}) {
  return (
    <ListRow selected={selected} onClick={onClick}>
      {backButton && (
        <ListRow.Icon>
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-colors",
              selected ? "text-foreground" : "text-muted-foreground/50",
            )}
          />
        </ListRow.Icon>
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
        <ListRow.Title>{item.title}</ListRow.Title>
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

  switch (schema.type) {
    case "object": {
      const obj: Record<string, unknown> = {};
      if (schema.properties) {
        const requiredKeys = schema.required ?? [];
        Object.entries(schema.properties).forEach(([key, propSchema]) => {
          // Only include required fields when onlyRequired is true
          if (!onlyRequired || requiredKeys.includes(key)) {
            obj[key] = generateDefaultValue(
              propSchema as JsonSchema,
              onlyRequired,
            );
          }
        });
      }
      return obj;
    }
    case "array": {
      // Generate one default item based on items schema
      if (schema.items) {
        return [generateDefaultValue(schema.items as JsonSchema, onlyRequired)];
      }
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
    executionResult,
    setExecutionResult,
    setExecutionError,
    isExecuting,
    setIsExecuting,
    stats,
    setStats,
  } = useToolState(tool.inputSchema as JsonSchema, initialInputParams);
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

  const handleInputChange = (key: string, value: string) => {
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
    <div className="flex flex-col items-center w-full h-full mx-auto pt-8 px-2 bg-background">
      {/* Tool Title & Description */}
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-medium text-foreground">{tool.name}</h1>
        <p className="text-muted-foreground text-base">
          {tool?.description || "No description available"}
        </p>
      </div>

      {/* Stats Row */}
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
          <span className="font-mono text-sm">{stats?.duration || "-"}</span>
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
      <div className="w-full h-full bg-background border border-border rounded-xl shadow-sm flex flex-col">
        <div className="h-10 flex items-center justify-between px-4 py-2 border-b border-border bg-background">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-sm bg-primary/10 flex items-center justify-center">
              <Play className="h-3 w-3 text-primary" />
            </div>
            <span className="font-medium text-sm">Input</span>
          </div>
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
        </div>

        <div className="p-4 pb-0 space-y-4 h-full overflow-auto min-h-[200px]">
          <ToolInput
            inputSchema={tool?.inputSchema as JsonSchema}
            inputParams={inputParams}
            setInputParams={setInputParams}
            handleInputChange={handleInputChange}
            mentions={mentions ?? []}
          />
        </div>
        <ExecutionResult
          executionResult={executionResult}
          placeholder="Run the tool to see results"
        />
      </div>
    </div>
  );
}

export function ExecutionResult({
  executionResult,
  placeholder,
}: {
  executionResult: Record<string, unknown> | null;
  placeholder?: string;
}) {
  const [viewMode, setViewMode] = useState<"json" | "view">("json");
  return (
    <div className="w-full shadow-sm h-full border-t border-border">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
          Execution Result
        </span>
        <div className="flex items-center bg-background rounded-lg p-1">
          <button
            onClick={() => setViewMode("json")}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-md transition-all",
              viewMode === "json"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            JSON
          </button>
          <button
            onClick={() => setViewMode("view")}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1",
              viewMode === "view"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            disabled
            title="Coming soon"
          >
            Create view
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="relative bg-zinc-950 text-zinc-50 p-4 font-mono text-xs h-full flex-1">
        {executionResult ? (
          <ScrollArea className="h-full w-full">
            <pre className="whitespace-pre-wrap break-all">
              {JSON.stringify(executionResult, null, 2)}
            </pre>
          </ScrollArea>
        ) : (
          <div className="flex flex-col items-center justify-center text-zinc-700 py-4 h-full">
            <Code className="h-8 w-8 mb-2 opacity-50" />
            {placeholder && <p>{placeholder}</p>}
          </div>
        )}

        {executionResult && (
          <div className="absolute top-4 right-4 flex gap-2">
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 border-zinc-700"
              onClick={() => {
                navigator.clipboard.writeText(
                  JSON.stringify(executionResult, null, 2),
                );
                toast.success("Copied to clipboard");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function InputField({
  name,
  type,
  description,
  required,
  value,
  onChange,
  mentions,
}: {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
  value?: string;
  onChange: (value: string) => void;
  mentions: MentionItem[];
}) {
  const isMultiline = type === "object" || type === "array";

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <label className="text-sm font-medium leading-none">{name}</label>
        {required && <span className="text-red-500 text-xs">*</span>}
        <span className="text-xs text-muted-foreground ml-auto">{type}</span>
      </div>
      {description && (
        <p className="text-xs text-muted-foreground mb-1">{description}</p>
      )}
      <MentionInput
        mentions={mentions}
        value={value}
        onChange={onChange}
        placeholder={
          isMultiline ? `Enter ${name} as JSON...` : `Enter ${name}...`
        }
        multiline={isMultiline}
        className={isMultiline ? "font-mono" : ""}
      />
    </div>
  );
}

export function ToolInput({
  inputSchema,
  inputParams,
  setInputParams,
  handleInputChange,
  mentions,
}: {
  inputSchema: JsonSchema;
  inputParams?: Record<string, unknown>;
  setInputParams?: (params: Record<string, unknown>) => void;
  handleInputChange?: (key: string, value: string) => void;
  mentions?: MentionItem[];
}) {
  const mentionItems = mentions ?? [];

  if (!inputSchema?.properties) {
    if (inputSchema) {
      return (
        <div className="space-y-2">
          <label className="text-sm font-medium">Raw JSON Input</label>
          <MentionInput
            mentions={mentionItems}
            value={
              typeof inputParams === "string"
                ? inputParams
                : JSON.stringify(inputParams, null, 2)
            }
            onChange={(text) => {
              try {
                setInputParams?.(JSON.parse(text));
              } catch {
                // Allow typing invalid JSON
              }
            }}
            placeholder="Enter JSON..."
            multiline
            className="font-mono"
          />
        </div>
      );
    }
    return (
      <div className="text-sm text-muted-foreground italic">
        No arguments defined in schema.
      </div>
    );
  }

  return (
    <>
      {Object.entries(inputSchema.properties).map(([key, prop]) => {
        const p = prop as { type?: string; description?: string };
        const rawValue = inputParams?.[key];
        const value =
          typeof rawValue === "object"
            ? JSON.stringify(rawValue, null, 2)
            : String(rawValue ?? "");

        return (
          <InputField
            key={key}
            name={key}
            type={p.type ?? "string"}
            description={p.description}
            required={inputSchema.required?.includes(key)}
            value={value}
            onChange={(v) => handleInputChange?.(key, v)}
            mentions={mentionItems}
          />
        );
      })}
    </>
  );
}

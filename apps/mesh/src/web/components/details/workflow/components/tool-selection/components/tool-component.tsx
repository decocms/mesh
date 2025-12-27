import { Loader2 } from "lucide-react";
import type { McpTool, UseMcpResult } from "@/web/hooks/use-mcp";
import type { JsonSchema } from "@/web/utils/constants";
import type { MentionItem } from "@/web/components/tiptap-mentions-input";
import { usePollingWorkflowExecution } from "../../../hooks/use-workflow-collection-item";
import {
  useCurrentStepName,
  useTrackingExecutionId,
} from "../../../stores/workflow";
import { useToolState } from "../hooks/use-tool-state";
import { useToolExecution } from "../hooks/use-tool-execution";
import { ToolHeader } from "./tool-header";
import { ToolStats } from "./tool-stats";
import { ToolInputSection } from "./tool-input-section";
import { ToolInput } from "./tool-input";
import { ExecutionResult } from "./execution-result";
import type { useConnection } from "@/web/hooks/collections/use-connection";

export function ToolComponent({
  tool,
  initialInputParams,
  connection,
  onInputChange,
  mentions,
  mcp,
}: {
  tool: McpTool;
  initialInputParams?: Record<string, unknown>;
  connection: ReturnType<typeof useConnection> | null;
  onInputChange?: (input: Record<string, unknown>) => void;
  mentions?: MentionItem[];
  mcp: UseMcpResult;
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
    (step: Record<string, unknown>) => step.step_id === currentStepName,
  );
  const executionResult =
    (stepResult ?? Object.keys(executionResultFromTool ?? {}).length > 0)
      ? executionResultFromTool
      : null;

  console.log({ stepResult, executionResultFromTool });

  const { execute } = useToolExecution(
    tool,
    connection?.id,
    inputParams,
    setExecutionResult,
    setExecutionError,
    setIsExecuting,
    setStats,
  );

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
        <ToolHeader name={tool.name} description={tool.description} />

        {/* Stats Row */}
        {!trackingExecutionId && (
          <ToolStats mcpState={mcp.state} stats={stats} />
        )}
      </div>
      <ToolInputSection
        isExecuting={isExecuting}
        onExecute={execute}
        showExecuteButton={!trackingExecutionId}
      >
        <ToolInput
          inputSchema={tool.inputSchema as JsonSchema}
          inputParams={inputParams}
          readOnly={trackingExecutionId ? true : undefined}
          setInputParams={setInputParams}
          handleInputChange={handleInputChange}
          mentions={mentions ?? []}
        />
      </ToolInputSection>
      {executionResult && <ExecutionResult executionResult={executionResult} />}
    </div>
  );
}

// Re-export useTool for backward compatibility
export { useTool } from "../hooks/use-tool";

import { createToolCaller } from "@/tools/client";
import type { McpTool } from "@/web/hooks/use-mcp";
import type { JsonSchema } from "@/web/utils/constants";
import { prepareToolArgs } from "../utils/prepare-tool-args";
import { calculateExecutionStats } from "../utils/calculate-execution-stats";
import type { ExecutionStats } from "../utils/calculate-execution-stats";

export function useToolExecution(
  tool: McpTool,
  connectionId: string | undefined,
  inputParams: Record<string, unknown>,
  setExecutionResult: (result: Record<string, unknown>) => void,
  setExecutionError: (error: string | null) => void,
  setIsExecuting: (isExecuting: boolean) => void,
  setStats: (stats: ExecutionStats | null) => void,
) {
  const execute = async () => {
    setIsExecuting(true);
    setExecutionError(null);
    setExecutionResult({});
    setStats(null);

    const startTime = performance.now();
    const toolCaller = createToolCaller(connectionId);

    try {
      const args = prepareToolArgs(inputParams, tool.inputSchema as JsonSchema);
      const result = await toolCaller(tool.name, args);
      const endTime = performance.now();
      const durationMs = Math.round(endTime - startTime);

      setExecutionResult(result as Record<string, unknown>);
      setStats(calculateExecutionStats(result, durationMs));
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

  return { execute };
}

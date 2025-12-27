import { useState } from "react";
import type { JsonSchema } from "@/web/utils/constants";
import { generateInitialParams } from "../utils/generate-initial-params";
import type { ExecutionStats } from "../utils/calculate-execution-stats";

export function useToolState(
  inputSchema: JsonSchema,
  defaultInputParams?: Record<string, unknown>,
) {
  const resolvedInputParams =
    defaultInputParams ?? generateInitialParams(inputSchema);
  const [inputParams, setInputParams] =
    useState<Record<string, unknown>>(resolvedInputParams);
  const [executionResult, setExecutionResult] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [stats, setStats] = useState<ExecutionStats | null>(null);

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

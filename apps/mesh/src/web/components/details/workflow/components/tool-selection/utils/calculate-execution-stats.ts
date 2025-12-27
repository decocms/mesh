export interface ExecutionStats {
  duration: string;
  tokens?: string;
  bytes?: string;
  cost?: string;
}

export function calculateExecutionStats(
  result: unknown,
  durationMs: number,
): ExecutionStats {
  const resultStr = JSON.stringify(result);
  const bytes = new TextEncoder().encode(resultStr).length;

  return {
    duration: `${durationMs}ms`,
    bytes: `${bytes} bytes`,
    // Mocking tokens/cost as we don't have real data for that yet
    tokens: `~${Math.ceil(bytes / 4)} tokens`,
    cost: "$0.0000",
  };
}

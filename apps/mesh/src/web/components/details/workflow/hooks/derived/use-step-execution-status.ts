import { usePollingWorkflowExecution } from "../queries/use-workflow-collection-item";
import {
  useTrackingExecutionId,
  useWorkflowSteps,
} from "../../stores/workflow";

export interface StepExecutionStatus {
  status: "pending" | "running" | "success" | "error";
  output?: unknown;
  error?: string;
  /** Index of the step in the steps array (for determining order) */
  stepIndex: number;
}

/**
 * Returns execution status for all steps when tracking an execution.
 * Determines step status based on:
 * - If step has output in step_results -> success
 * - If step has error in step_results -> error
 * - If execution is running and step is next in line -> running
 * - Otherwise -> pending
 */
export function useStepExecutionStatuses():
  | Record<string, StepExecutionStatus>
  | undefined {
  const trackingExecutionId = useTrackingExecutionId();
  const steps = useWorkflowSteps();
  const { step_results, item: executionItem } =
    usePollingWorkflowExecution(trackingExecutionId);

  if (!trackingExecutionId || !executionItem) {
    return undefined;
  }

  const statuses: Record<string, StepExecutionStatus> = {};

  // Build a map of step results by step_id
  const resultsByStepId = new Map<
    string,
    { output?: unknown; error?: unknown }
  >();
  if (step_results) {
    for (const result of step_results) {
      const stepId = result.step_id as string | undefined;
      if (stepId) {
        resultsByStepId.set(stepId, {
          output: result.output,
          error: result.error,
        });
      }
    }
  }

  // Find the last completed step index to determine which step is currently running
  let lastCompletedIndex = -1;

  steps.forEach((step, index) => {
    const result = resultsByStepId.get(step.name);
    if (result?.output !== undefined || result?.error !== undefined) {
      lastCompletedIndex = index;
    }
  });

  // Determine status for each step
  steps.forEach((step, index) => {
    const result = resultsByStepId.get(step.name);

    let status: StepExecutionStatus["status"] = "pending";

    if (result?.error !== undefined) {
      status = "error";
    } else if (result?.output !== undefined) {
      status = "success";
    } else if (
      executionItem.status === "running" &&
      index === lastCompletedIndex + 1
    ) {
      // This step is currently running (it's the first step without a result)
      status = "running";
    }

    statuses[step.name] = {
      status,
      output: result?.output,
      error: typeof result?.error === "string" ? result.error : undefined,
      stepIndex: index,
    };
  });

  return statuses;
}

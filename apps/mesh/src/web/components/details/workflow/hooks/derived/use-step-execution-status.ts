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
bu * - If step name is in completed_steps.success -> success
 * - If step name is in completed_steps.error -> error
 * - If execution is running and step is next in line -> running
 * - Otherwise -> pending
 */
export function useStepExecutionStatuses():
  | Record<string, StepExecutionStatus>
  | undefined {
  const trackingExecutionId = useTrackingExecutionId();
  const steps = useWorkflowSteps();
  const { item: executionItem } =
    usePollingWorkflowExecution(trackingExecutionId);

  if (!trackingExecutionId || !executionItem) {
    return undefined;
  }

  const statuses: Record<string, StepExecutionStatus> = {};

  // Get completed step names from the execution
  const successSteps = new Set(executionItem.completed_steps?.success ?? []);
  const errorSteps = new Set(executionItem.completed_steps?.error ?? []);

  // Find the last completed step index to determine which step is currently running
  let lastCompletedIndex = -1;

  steps.forEach((step, index) => {
    if (successSteps.has(step.name) || errorSteps.has(step.name)) {
      lastCompletedIndex = index;
    }
  });

  // Determine status for each step
  steps.forEach((step, index) => {
    let status: StepExecutionStatus["status"] = "pending";

    if (errorSteps.has(step.name)) {
      status = "error";
    } else if (successSteps.has(step.name)) {
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
      // Note: output/error details need to be fetched separately via useExecutionCompletedStep
      output: undefined,
      error: undefined,
      stepIndex: index,
    };
  });

  return statuses;
}

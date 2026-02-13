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
 * Check if a step name matches any entry in the error list.
 * Handles both exact matches ("step_a") and forEach iteration matches
 * ("generate_text[7]" should match base step "generate_text").
 */
function hasErrorForStep(stepName: string, errorEntries: string[]): boolean {
  for (const entry of errorEntries) {
    if (entry === stepName) return true;
    // Match forEach iterations: "stepName[N]" belongs to base step "stepName"
    if (entry.startsWith(`${stepName}[`)) return true;
  }
  return false;
}

/**
 * Returns execution status for all steps when tracking an execution.
 * Determines step status based on:
 * - If step name is in completed_steps.success -> success
 * - If step name (or any of its forEach iterations) is in completed_steps.error -> error
 * - If execution is running and step is next in line -> running
 * - If execution errored and step was in running_steps -> error (execution-level failure)
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
  const successSteps = new Set(
    executionItem.completed_steps?.success?.map((step) => step.name) ?? [],
  );
  const errorEntries = executionItem.completed_steps?.error ?? [];
  const runningSteps = new Set(executionItem.running_steps ?? []);
  const executionStatus = executionItem.status;
  const executionError =
    executionItem.error != null
      ? typeof executionItem.error === "string"
        ? executionItem.error
        : JSON.stringify(executionItem.error)
      : undefined;

  // Find the last completed step index to determine which step is currently running
  let lastCompletedIndex = -1;

  steps.forEach((step, index) => {
    if (
      successSteps.has(step.name) ||
      hasErrorForStep(step.name, errorEntries)
    ) {
      lastCompletedIndex = index;
    }
  });

  // Determine status for each step
  steps.forEach((step, index) => {
    let status: StepExecutionStatus["status"] = "pending";
    let error: string | undefined;

    if (hasErrorForStep(step.name, errorEntries)) {
      status = "error";
      error = executionError;
    } else if (successSteps.has(step.name)) {
      status = "success";
    } else if (
      (executionStatus === "error" || executionStatus === "failed") &&
      runningSteps.has(step.name)
    ) {
      // Execution failed while this step was running
      status = "error";
      error = executionError;
    } else if (
      executionStatus === "running" &&
      index === lastCompletedIndex + 1
    ) {
      // This step is currently running (it's the first step without a result)
      status = "running";
    }

    statuses[step.name] = {
      status,
      output: undefined,
      error,
      stepIndex: index,
    };
  });

  return statuses;
}

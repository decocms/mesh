import { usePollingWorkflowExecution } from "../queries/use-workflow-collection-item";
import {
  useTrackingExecutionId,
  useCurrentStepName,
} from "../../stores/workflow";

/**
 * Returns the execution result for the currently selected step.
 * Only returns data when tracking an execution and the step has been executed.
 */
export function useCurrentStepExecutionResult() {
  const trackingExecutionId = useTrackingExecutionId();
  const currentStepName = useCurrentStepName();
  const {
    step_results,
    item: executionItem,
    isLoading,
  } = usePollingWorkflowExecution(trackingExecutionId);

  if (!trackingExecutionId || !currentStepName || !step_results) {
    return { output: undefined, isLoading, isTracking: !!trackingExecutionId };
  }

  // Find the result for the current step
  const stepResult = step_results.find(
    (result: { step_id?: unknown; output?: unknown }) =>
      result.step_id === currentStepName,
  );

  return {
    output: stepResult?.output,
    status: executionItem?.status,
    isLoading,
    isTracking: true,
  };
}

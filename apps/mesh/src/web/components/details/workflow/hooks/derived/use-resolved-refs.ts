import { usePollingWorkflowExecution } from "../queries/use-workflow-collection-item";
import { useTrackingExecutionId } from "../../stores/workflow";

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


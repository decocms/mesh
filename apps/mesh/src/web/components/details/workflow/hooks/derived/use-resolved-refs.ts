import { usePollingWorkflowExecution } from "../queries/use-workflow-collection-item";
import { useTrackingExecutionId } from "../../stores/workflow";

export function useResolvedRefs() {
  const trackingExecutionId = useTrackingExecutionId();
  const { item: executionItem } =
    usePollingWorkflowExecution(trackingExecutionId);
  const resolvedRefs: Record<string, unknown> | undefined =
    trackingExecutionId && executionItem
      ? (() => {
          const refs: Record<string, unknown> = {};
          // Add workflow input as "input"
          if (executionItem?.input) {
            refs["input"] = executionItem.input;
          }
          return refs;
        })()
      : undefined;
  return resolvedRefs;
}

import { WorkflowExecution } from "@decocms/bindings/workflow";
import { createToolCaller } from "@/tools/client";
import { useWorkflowBindingConnection } from "../use-workflow-binding-connection";
import { useToolCallQuery } from "@/web/hooks/use-tool-call";

type ExecutionQueryResult = {
  item: WorkflowExecution | null;
  step_results: Record<string, unknown> | null;
};

export function usePollingWorkflowExecution(executionId?: string) {
  const connection = useWorkflowBindingConnection();
  const toolCaller = createToolCaller(connection.id);
  const { data, isLoading } = useToolCallQuery<
    { id: string | undefined },
    ExecutionQueryResult
  >({
    toolCaller: toolCaller,
    toolName: "COLLECTION_WORKFLOW_EXECUTION_GET",
    toolInputParams: {
      id: executionId,
    },
    scope: connection.id,
    enabled: !!executionId,
    refetchInterval: executionId
      ? (query) => {
          const status = query.state?.data?.item?.status;
          return status === "running" || status === "enqueued" ? 2000 : false;
        }
      : false,
  });

  return {
    item: data?.item,
    step_results: data?.step_results,
    isLoading,
  } as {
    item: WorkflowExecution | null;
    step_results: Record<string, unknown>[] | null;
    isLoading: boolean;
  };
}

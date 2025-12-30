import { useParams } from "@tanstack/react-router";
import { useCollectionItem } from "@/web/hooks/use-collections";
import { Workflow, WorkflowExecution } from "@decocms/bindings/workflow";
import { createToolCaller, UNKNOWN_CONNECTION_ID } from "@/tools/client";
import { useWorkflowBindingConnection } from "../use-workflow-binding-connection";
import { useToolCallQuery } from "@/web/hooks/use-tool-call";

export function useWorkflowCollectionItem(itemId: string) {
  const { connectionId } = useParams({
    strict: false,
  });
  const toolCaller = createToolCaller(connectionId ?? UNKNOWN_CONNECTION_ID);
  const item = useCollectionItem<Workflow>(
    connectionId ?? UNKNOWN_CONNECTION_ID,
    "workflow",
    itemId,
    toolCaller,
  );
  return {
    item,
    update: (updates: Record<string, unknown>) => {
      toolCaller("COLLECTION_WORKFLOW_UPDATE", {
        id: itemId,
        data: updates,
      });
    },
  };
}

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

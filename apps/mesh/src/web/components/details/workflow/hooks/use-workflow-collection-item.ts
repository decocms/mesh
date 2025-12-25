import { useParams } from "@tanstack/react-router";
import {
  useCollectionItem,
  useCollectionList,
} from "@/web/hooks/use-collections";
import { Workflow, WorkflowExecution } from "@decocms/bindings/workflow";
import { createToolCaller, UNKNOWN_CONNECTION_ID } from "@/tools/client";
import { useWorkflowBindingConnection } from "./use-workflow-binding-connection";
import { useToolCallQuery } from "@/web/hooks/use-tool-call";
import { Query } from "@tanstack/react-query";
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

export function useWorkflowExecutionCollectionList({
  workflowId,
}: {
  workflowId: string;
}) {
  const { id: connectionId } = useWorkflowBindingConnection();
  const toolCaller = createToolCaller(connectionId);
  const list = useCollectionList<WorkflowExecution>(
    connectionId,
    "WORKFLOW_EXECUTION",
    toolCaller,
    {
      filters: [
        {
          column: "workflow_id",
          value: workflowId,
        },
      ],
    },
  );
  return {
    list: list.filter((item) => item.workflow_id === workflowId),
  };
}

export function usePollingWorkflowExecution(executionId?: string) {
  const connection = useWorkflowBindingConnection();
  const toolCaller = createToolCaller(connection.id);
  const { data, isLoading } = useToolCallQuery({
    toolCaller: toolCaller,
    toolName: "COLLECTION_WORKFLOW_EXECUTION_GET",
    toolInputParams: {
      id: executionId,
    },
    scope: connection.id,
    enabled: !!executionId,
    refetchInterval: executionId
      ? (
          query: Query<
            {
              item: WorkflowExecution | null;
              step_results: Record<string, unknown> | null;
            },
            Error,
            {
              item: WorkflowExecution | null;
              step_results: Record<string, unknown> | null;
            },
            readonly unknown[]
          >,
        ) => {
          return (query.state?.data?.item?.completed_at_epoch_ms === null &&
            query.state?.data?.item?.status === "running") ||
            query.state?.data?.item?.status === "enqueued"
            ? 5000
            : false;
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

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
  workflowId?: string;
}) {
  const { connectionId } = useParams({
    strict: false,
  });
  const toolCaller = createToolCaller(connectionId ?? UNKNOWN_CONNECTION_ID);
  const list = useCollectionList<WorkflowExecution>(
    connectionId ?? UNKNOWN_CONNECTION_ID,
    "workflow_execution",
    toolCaller,
    {
      sortKey: "created_at",
      sortDirection: "desc",
      filters: [
        workflowId
          ? {
              column: "workflow_id",
              value: workflowId,
            }
          : undefined,
      ].filter(Boolean) as [],
    },
  );
  return {
    list,
  };
}

export function useWorkflowExecutionCollectionItem(itemId?: string) {
  const { connectionId } = useParams({
    strict: false,
  });
  const toolCaller = createToolCaller(connectionId ?? UNKNOWN_CONNECTION_ID);
  const item = useCollectionItem<WorkflowExecution>(
    connectionId ?? UNKNOWN_CONNECTION_ID,
    "workflow_execution",
    itemId,
    toolCaller,
  );
  return {
    item,
  };
}

export function usePollingWorkflowExecution(executionId?: string) {
  const connection = useWorkflowBindingConnection();
  const toolCaller = createToolCaller(connection.id);
  const { data } = useToolCallQuery({
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
            { item: WorkflowExecution | null },
            Error,
            { item: WorkflowExecution | null },
            readonly unknown[]
          >,
        ) => {
          return query.state?.data?.item?.completed_at_epoch_ms === null
            ? 5000
            : false;
        }
      : false,
  }) as {
    data: {
      item:
        | (WorkflowExecution & {
            step_results: {
              output?: unknown;
              error?: unknown;
              startedAt: number;
              stepId: string;
              executionId: string;
              completedAt?: number;
            }[];
          })
        | null;
    };
  };

  return {
    item: data?.item,
  };
}

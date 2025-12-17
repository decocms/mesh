import { useParams } from "@tanstack/react-router";
import {
  CollectionFilter,
  useCollectionItem,
  useCollectionList,
} from "@/web/hooks/use-collections";
import {
  Workflow,
  WorkflowExecution,
  WorkflowExecutionStepResult,
} from "@decocms/bindings/workflow";
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
  const list = useCollectionList(
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
      ].filter(Boolean) as CollectionFilter[],
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

function useWorkflowGetExecutionStepResultTool() {
  const connection = useWorkflowBindingConnection();
  const stepResultsGetTool = connection.tools?.find(
    (tool) => tool.name === "COLLECTION_EXECUTION_STEP_RESULTS_GET",
  );
  if (!stepResultsGetTool) {
    throw new Error("COLLECTION_EXECUTION_STEP_RESULTS_GET tool not found");
  }
  return {
    tool: stepResultsGetTool,
    connectionId: connection.id,
  };
}

export function usePollingWorkflowExecution(executionId?: string) {
  const { connectionId } = useWorkflowGetExecutionStepResultTool();
  const toolCaller = createToolCaller(connectionId);

  const { data } = useToolCallQuery({
    toolCaller: toolCaller,
    toolName: "COLLECTION_WORKFLOW_EXECUTION_GET",
    toolInputParams: {
      id: executionId,
    },
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
            ? 1000
            : false;
        }
      : false,
  }) as {
    data: {
      item:
        | (WorkflowExecution & { step_results: WorkflowExecutionStepResult[] })
        | null;
    };
  };

  return {
    item: data?.item,
  };
}

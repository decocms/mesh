import { useRef } from "react";
import { WorkflowExecution } from "@decocms/bindings/workflow";
import { createToolCaller } from "@/tools/client";
import { useWorkflowBindingConnection } from "../use-workflow-binding-connection";
import { useToolCallQuery } from "@/web/hooks/use-tool-call";

type ExecutionQueryResult = {
  item: WorkflowExecution | null;
};

const POLLING_INTERVALS = [1, 1000, 2000, 3000, 5000, 10000];

export function usePollingWorkflowExecution(executionId?: string) {
  const connection = useWorkflowBindingConnection();
  const toolCaller = createToolCaller(connection.id);
  const intervalIndexRef = useRef(0);

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
          if (status === "running" || status === "enqueued") {
            const interval = POLLING_INTERVALS[intervalIndexRef.current] ?? 1;
            intervalIndexRef.current =
              (intervalIndexRef.current + 1) % POLLING_INTERVALS.length;
            return interval;
          }
          intervalIndexRef.current = 0;
          return false;
        }
      : false,
  });

  return {
    item: data?.item,
    isLoading,
  } as {
    item: WorkflowExecution | null;
    isLoading: boolean;
  };
}

export function useExecutionCompletedStep(
  executionId?: string,
  stepName?: string,
) {
  const connection = useWorkflowBindingConnection();
  const toolCaller = createToolCaller(connection.id);

  const { data, isLoading } = useToolCallQuery<
    { executionId: string | undefined; stepId: string | undefined },
    { output: unknown | null; error: string | null }
  >({
    toolCaller: toolCaller,
    toolName: "COLLECTION_WORKFLOW_EXECUTION_GET_STEP_RESULT",
    toolInputParams: {
      executionId: executionId,
      stepId: stepName,
    },
    scope: connection.id,
    enabled: !!executionId && !!stepName,
  });

  return {
    output: data?.output,
    error: data?.error,
    isLoading,
  } as {
    output: unknown | null;
    error: string | null;
    isLoading: boolean;
  };
}

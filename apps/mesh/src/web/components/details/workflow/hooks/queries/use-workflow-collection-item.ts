import { useRef } from "react";
import { WorkflowExecution } from "@decocms/bindings/workflow";
import { useWorkflowBindingConnection } from "../use-workflow-binding-connection";
import {
  useMCPClient,
  useMCPToolCallQuery,
  useProjectContext,
} from "@decocms/mesh-sdk";

type ExecutionQueryResult = {
  item: WorkflowExecution | null;
};

const POLLING_INTERVALS = [100, 1000, 2000];

export function usePollingWorkflowExecution(executionId?: string) {
  const { org } = useProjectContext();
  const connection = useWorkflowBindingConnection();
  const intervalIndexRef = useRef(0);

  const client = useMCPClient({
    connectionId: connection.id,
    orgSlug: org.slug,
    isVirtualMCP: false,
  });

  const { data, isLoading } = useMCPToolCallQuery<ExecutionQueryResult>({
    client,
    toolName: "COLLECTION_WORKFLOW_EXECUTION_GET",
    toolArguments: {
      id: executionId,
    },
    staleTime: 0,
    gcTime: 0,
    enabled: !!executionId,
    select: (result) =>
      ((result as { structuredContent?: unknown }).structuredContent ??
        result) as ExecutionQueryResult,
    refetchInterval: executionId
      ? (query: unknown) => {
          const queryData = query as {
            state?: { data?: ExecutionQueryResult };
          };
          const status = queryData.state?.data?.item?.status;
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
  const { org } = useProjectContext();
  const connection = useWorkflowBindingConnection();

  const client = useMCPClient({
    connectionId: connection.id,
    orgSlug: org.slug,
    isVirtualMCP: false,
  });

  const { data, isLoading } = useMCPToolCallQuery<{
    output: unknown | null;
    error: string | null;
  }>({
    client,
    toolName: "COLLECTION_WORKFLOW_EXECUTION_GET_STEP_RESULT",
    toolArguments: {
      executionId: executionId,
      stepId: stepName,
    },
    enabled: !!executionId && !!stepName,
    select: (result) =>
      ((result as { structuredContent?: unknown }).structuredContent ??
        result) as { output: unknown | null; error: string | null },
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

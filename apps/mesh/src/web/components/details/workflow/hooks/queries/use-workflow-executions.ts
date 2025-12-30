import { useToolCallQuery } from "@/web/hooks/use-tool-call";
import { createToolCaller } from "@/tools/client";
import { useWorkflowBindingConnection } from "../use-workflow-binding-connection";
import { useWorkflow } from "../../stores/workflow";
import type { WorkflowExecution } from "@decocms/bindings/workflow";

interface WorkflowExecutionsListResponse {
  items: WorkflowExecution[];
}

/**
 * Hook to list all executions for the current workflow.
 * Returns executions sorted by most recent first.
 */
export function useWorkflowExecutions() {
  const connection = useWorkflowBindingConnection();
  const workflow = useWorkflow();
  const toolCaller = createToolCaller(connection.id);

  const { data, isLoading, refetch } = useToolCallQuery({
    toolCaller: toolCaller,
    toolName: "COLLECTION_WORKFLOW_EXECUTION_LIST",
    toolInputParams: {
      where: {
        field: ["workflow"],
        operator: "eq",
        value: workflow.id,
      },
      orderBy: [{ field: ["created_at"], direction: "desc" }],
      limit: 100,
    },
    scope: `${connection.id}-executions-${workflow.id}`,
    enabled: !!workflow.id,
    staleTime: 5000,
  });

  const response = data as WorkflowExecutionsListResponse | undefined;

  return {
    executions: response?.items ?? [],
    isLoading,
    refetch,
  };
}

import { useWorkflow } from "@/web/components/details/workflow/stores/workflow";
import { useWorkflowExecutionCollectionList } from "../../../hooks/use-workflow-collection-item";

export function useWorkflowExecutionById(executionId: string) {
  const workflow = useWorkflow();
  const { list: executions } = useWorkflowExecutionCollectionList({
    workflowId: workflow.id,
  });
  return executions.find(
    (execution: { id: string }) => execution.id === executionId,
  );
}

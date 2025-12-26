import { createToolCaller } from "@/tools/client";
import { useToolCallMutation } from "@/web/hooks/use-tool-call";
import { useWorkflow, useWorkflowActions } from "../stores/workflow";
import { useWorkflowBindingConnection } from "./use-workflow-binding-connection";

export function useWorkflowStart() {
  const { id: connectionId } = useWorkflowBindingConnection();
  const { setTrackingExecutionId } = useWorkflowActions();
  const toolCaller = createToolCaller(connectionId);
  const workflow = useWorkflow();
  const { mutateAsync: startWorkflow, isPending } = useToolCallMutation({
    toolCaller,
    toolName: "COLLECTION_WORKFLOW_EXECUTION_CREATE",
  });

  const handleRunWorkflow = async (upToStepName?: string) => {
    const startAtEpochMs = Date.now();
    const timeoutMs = 30000;

    const params: Record<string, unknown> = {
      workflow_id: workflow.id,
      input: {
        limit: 15,
      },
      start_at_epoch_ms: startAtEpochMs,
      timeout_ms: timeoutMs,
    };

    // If running up to a specific step, add that to params
    if (upToStepName) {
      params.up_to_step = upToStepName;
    }

    const result = await startWorkflow(params);

    const executionId =
      (result as { id: string }).id ??
      (result as { structuredContent: { id: string } }).structuredContent.id;
    setTrackingExecutionId(executionId);
    return executionId;
  };

  return { handleRunWorkflow, isPending };
}


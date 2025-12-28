import { useToolCallMutation } from "@/web/hooks/use-tool-call";
import { createToolCaller } from "@/tools/client";
import {
  useTrackingExecutionId,
  useWorkflow,
  useWorkflowActions,
} from "@/web/components/details/workflow/stores/workflow";
import { useWorkflowBindingConnection } from "./use-workflow-binding-connection";

// ============================================
// Workflow Start Hook
// ============================================

export function useWorkflowStart() {
  const { id: connectionId } = useWorkflowBindingConnection();
  const { setTrackingExecutionId } = useWorkflowActions();
  const toolCaller = createToolCaller(connectionId);
  const workflow = useWorkflow();
  const { mutateAsync: startWorkflow, isPending } = useToolCallMutation({
    toolCaller,
    toolName: "COLLECTION_WORKFLOW_EXECUTION_CREATE",
  });
  const handleRunWorkflow = async () => {
    const startAtEpochMs = Date.now();
    const timeoutMs = 30000;
    const result = await startWorkflow({
      workflow_id: workflow.id,
      input: {
        limit: 15,
      },
      start_at_epoch_ms: startAtEpochMs,
      timeout_ms: timeoutMs,
    });

    const executionId =
      (result as { id: string }).id ??
      (result as { structuredContent: { id: string } }).structuredContent.id;
    setTrackingExecutionId(executionId);
    return executionId;
  };

  return { handleRunWorkflow, isPending };
}

export function useWorkflowResume() {
  const { id: connectionId } = useWorkflowBindingConnection();
  const toolCaller = createToolCaller(connectionId);
  const trackingExecutionId = useTrackingExecutionId();

  const { mutateAsync: resumeWorkflow, isPending } = useToolCallMutation({
    toolCaller,
    toolName: "RESUME_EXECUTION",
  });

  const handleResumeWorkflow = async () => {
    await resumeWorkflow({
      executionId: trackingExecutionId,
    });
  };

  return { handleResumeWorkflow, isPending };
}

export function useWorkflowCancel() {
  const { id: connectionId } = useWorkflowBindingConnection();
  const toolCaller = createToolCaller(connectionId);
  const trackingExecutionId = useTrackingExecutionId();

  const { mutateAsync: cancelWorkflow, isPending } = useToolCallMutation({
    toolCaller,
    toolName: "CANCEL_EXECUTION",
  });

  const handleCancelWorkflow = async () => {
    await cancelWorkflow({
      executionId: trackingExecutionId,
    });
  };

  return { handleCancelWorkflow, isPending };
}

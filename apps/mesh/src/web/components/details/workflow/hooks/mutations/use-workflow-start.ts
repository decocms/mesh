import { useToolCallMutation } from "@/web/hooks/use-tool-call";
import { createToolCaller } from "@/tools/client";
import {
  useSelectedVirtualMcpId,
  useWorkflow,
  useWorkflowActions,
} from "@/web/components/details/workflow/stores/workflow";
import { useWorkflowBindingConnection } from "../use-workflow-binding-connection";
import { useWorkflowInputSchema } from "../derived/use-workflow-input-schema";

export function useWorkflowStart() {
  const { id: connectionId } = useWorkflowBindingConnection();
  const { setTrackingExecutionId } = useWorkflowActions();
  const toolCaller = createToolCaller(connectionId);
  const workflow = useWorkflow();
  const selectedVirtualMcpId = useSelectedVirtualMcpId();
  const inputSchema = useWorkflowInputSchema();
  const { mutateAsync: startWorkflow, isPending } = useToolCallMutation({
    toolCaller,
    toolName: "COLLECTION_WORKFLOW_EXECUTION_CREATE",
  });

  const handleRunWorkflow = async (input: Record<string, unknown> = {}) => {
    if (!selectedVirtualMcpId) {
      throw new Error("Please select an Agent before running the workflow");
    }
    const startAtEpochMs = Date.now();
    const result = await startWorkflow({
      input,
      virtual_mcp_id: selectedVirtualMcpId,
      start_at_epoch_ms: startAtEpochMs,
      workflow_collection_id: workflow.id,
    });

    const executionId =
      (result as { item: { id: string } })?.item?.id ??
      (result as { structuredContent: { item: { id: string } } })
        ?.structuredContent?.item?.id;
    setTrackingExecutionId(executionId);
    return executionId;
  };

  /** Whether the workflow requires input before running */
  const requiresInput = inputSchema !== null;

  return { handleRunWorkflow, isPending, requiresInput, inputSchema };
}

export function useWorkflowCancel() {
  const { id: connectionId } = useWorkflowBindingConnection();
  const toolCaller = createToolCaller(connectionId);
  const { mutateAsync: cancelWorkflow, isPending: isCancelling } =
    useToolCallMutation({
      toolCaller,
      toolName: "CANCEL_EXECUTION",
    });

  const handleCancelWorkflow = async (executionId: string) => {
    const result = await cancelWorkflow({
      executionId,
    });
    return result;
  };

  return { handleCancelWorkflow, isCancelling };
}

export function useWorkflowResume() {
  const { id: connectionId } = useWorkflowBindingConnection();
  const toolCaller = createToolCaller(connectionId);
  const { mutateAsync: resumeWorkflow, isPending: isResuming } =
    useToolCallMutation({
      toolCaller,
      toolName: "RESUME_EXECUTION",
    });

  const handleResumeWorkflow = async (executionId: string) => {
    const result = (await resumeWorkflow({
      executionId,
    })) as {
      success: boolean;
    };
    return result.success;
  };

  return { handleResumeWorkflow, isResuming };
}

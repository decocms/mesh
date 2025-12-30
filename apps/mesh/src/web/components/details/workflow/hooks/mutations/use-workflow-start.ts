import { useToolCallMutation } from "@/web/hooks/use-tool-call";
import { createToolCaller } from "@/tools/client";
import {
  useSelectedGatewayId,
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
  const selectedGatewayId = useSelectedGatewayId();
  const inputSchema = useWorkflowInputSchema();
  const { mutateAsync: startWorkflow, isPending } = useToolCallMutation({
    toolCaller,
    toolName: "COLLECTION_WORKFLOW_EXECUTION_CREATE",
  });

  const handleRunWorkflow = async (input: Record<string, unknown> = {}) => {
    if (!selectedGatewayId) {
      throw new Error("Please select a gateway before running the workflow");
    }
    const startAtEpochMs = Date.now();
    const timeoutMs = 30000;
    const result = await startWorkflow({
      steps: workflow.steps,
      input,
      gateway_id: selectedGatewayId,
      start_at_epoch_ms: startAtEpochMs,
      timeout_ms: timeoutMs,
    });

    const executionId =
      (result as { id: string }).id ??
      (result as { structuredContent: { id: string } }).structuredContent.id;
    setTrackingExecutionId(executionId);
    return executionId;
  };

  /** Whether the workflow requires input before running */
  const requiresInput = inputSchema !== null;

  return { handleRunWorkflow, isPending, requiresInput, inputSchema };
}

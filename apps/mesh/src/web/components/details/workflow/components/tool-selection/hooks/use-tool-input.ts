import { useWorkflowActions } from "@/web/components/details/workflow/stores/workflow";
import type { ToolStep } from "../../types";
import { useStepMentions } from "./use-step-mentions";

/**
 * Hook to manage tool input changes and provide mentions for the input form.
 */
export function useToolInput(step: ToolStep) {
  const { updateStep } = useWorkflowActions();
  const mentions = useStepMentions(step.name);

  const handleInputChange = (inputParams: Record<string, unknown>) => {
    if (!step?.action?.toolName) return;
    updateStep(step.name, {
      input: { ...step.input, ...inputParams },
    });
  };

  return { mentions, handleInputChange };
}

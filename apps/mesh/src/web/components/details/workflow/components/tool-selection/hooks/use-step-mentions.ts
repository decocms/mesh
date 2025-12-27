import { useWorkflowSteps } from "@/web/components/details/workflow/stores/workflow";
import { MentionItem } from "@/web/components/tiptap-mentions-input";
import { convertJsonSchemaToMentionItems } from "../../utils/json-schema-to-mentions";

/**
 * Hook to generate mention items from previous workflow steps.
 * Returns a list of mentionable fields from all steps before the current step.
 */
export function useStepMentions(currentStepName: string): MentionItem[] {
  const workflowSteps = useWorkflowSteps();
  const currentStepIndex = workflowSteps.findIndex(
    (s) => s.name === currentStepName,
  );
  const previousSteps = workflowSteps.slice(0, currentStepIndex);

  return previousSteps.map((step) => ({
    id: step.name,
    label: step.name,
    children: convertJsonSchemaToMentionItems(
      step.outputSchema as Record<string, unknown>,
      `${step.name}.`,
    ),
  }));
}

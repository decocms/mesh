import type { MentionItem } from "@/web/components/tiptap-mentions-input";
import type { JsonSchema } from "@/web/utils/constants";
import { useWorkflow } from "../../stores/workflow";

/**
 * Build mention items available to a given step.
 *
 * Returns:
 *  - @input.* — from the workflow's `input_schema` (if defined)
 *  - @<prevStep>.* — from each preceding step's `outputSchema`
 */
export function useStepMentions(
  currentStepName: string | undefined,
): MentionItem[] {
  const workflow = useWorkflow();
  const mentions: MentionItem[] = [];

  // 1. Workflow input fields
  const inputSchema = workflow.input_schema as JsonSchema | undefined;
  if (inputSchema?.properties) {
    const children = schemaPropertiesToMentions(
      "input",
      inputSchema.properties as Record<string, JsonSchema>,
    );
    mentions.push({
      id: "input",
      label: "input",
      children: children.length > 0 ? children : undefined,
    });
  }

  // 2. Previous steps' outputs
  for (const step of workflow.steps) {
    if (step.name === currentStepName) break; // only preceding steps
    const outputSchema = step.outputSchema as JsonSchema | undefined;
    if (!outputSchema) {
      mentions.push({ id: step.name, label: step.name });
      continue;
    }
    const children = schemaPropertiesToMentions(
      step.name,
      (outputSchema.properties ?? {}) as Record<string, JsonSchema>,
    );
    mentions.push({
      id: step.name,
      label: step.name,
      children: children.length > 0 ? children : undefined,
    });
  }

  return mentions;
}

function schemaPropertiesToMentions(
  parentId: string,
  properties: Record<string, JsonSchema>,
): MentionItem[] {
  return Object.entries(properties).map(([key, propSchema]) => {
    const id = `${parentId}.${key}`;
    const nestedProps = propSchema.properties as
      | Record<string, JsonSchema>
      | undefined;
    const children =
      propSchema.type === "object" && nestedProps
        ? schemaPropertiesToMentions(id, nestedProps)
        : undefined;
    return {
      id,
      label: key,
      children: children && children.length > 0 ? children : undefined,
    };
  });
}

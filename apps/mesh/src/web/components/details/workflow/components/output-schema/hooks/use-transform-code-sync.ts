import {
  useSelectedPaths,
  useOutputSchema,
  buildSelectedSchema,
} from "../../../stores/output-schema-selection.ts";
import {
  useCurrentStep,
  useWorkflowActions,
} from "../../../stores/workflow.tsx";
import { jsonSchemaToTypeScript } from "../../../typescript-to-json-schema.ts";
import type { ToolCallAction } from "@decocms/bindings/workflow";

/**
 * Replace the Input interface in code with a new interface definition.
 * If no Input interface exists, prepends the new one.
 * Handles nested braces in the interface body.
 */
function replaceInputInterface(
  code: string,
  newInputInterface: string,
): string {
  // Find "interface Input {" and then match balanced braces
  const startMatch = code.match(/interface\s+Input\s*\{/);
  if (!startMatch || startMatch.index === undefined) {
    // No existing Input interface, prepend the new one
    return `${newInputInterface}\n\n${code.trimStart()}`;
  }

  const startIdx = startMatch.index;
  const braceStart = startIdx + startMatch[0].length - 1; // Position of opening {

  // Find the matching closing brace
  let depth = 1;
  let endIdx = braceStart + 1;
  while (endIdx < code.length && depth > 0) {
    if (code[endIdx] === "{") depth++;
    else if (code[endIdx] === "}") depth--;
    endIdx++;
  }

  // Replace the entire interface (from "interface Input" to closing "}")
  return code.slice(0, startIdx) + newInputInterface + code.slice(endIdx);
}

/**
 * Generate the Input interface TypeScript code from the selected schema properties.
 */
function generateInputInterface(
  schema: Record<string, unknown>,
  selectedPaths: string[],
): string {
  const selectedPathsSet = new Set(selectedPaths);
  const selectedSchema = buildSelectedSchema(schema, selectedPathsSet);

  if (!selectedSchema) {
    return "interface Input {}";
  }

  return jsonSchemaToTypeScript(selectedSchema, "Input");
}

/**
 * Hook that provides functions to sync the output schema selection with the transformCode.
 *
 * This hook provides:
 * - `syncInputInterface`: Function to update the transformCode with the current selection
 * - `currentInputInterface`: The TypeScript interface generated from current selection
 */
export function useTransformCodeSync() {
  const schema = useOutputSchema();
  const selectedPaths = useSelectedPaths();
  const step = useCurrentStep();
  const { updateStep } = useWorkflowActions();

  const currentInputInterface = generateInputInterface(schema, selectedPaths);

  const syncInputInterface = () => {
    if (!step) return;

    const action = step.action as ToolCallAction;
    const currentTransformCode =
      action.transformCode ?? getDefaultTransformCode();

    const updatedCode = replaceInputInterface(
      currentTransformCode,
      currentInputInterface,
    );

    updateStep(step.name, {
      action: {
        ...action,
        transformCode: updatedCode,
      },
    });
  };

  return {
    syncInputInterface,
    currentInputInterface,
    selectedPaths,
  };
}

function getDefaultTransformCode(): string {
  return `interface Input {}

export default function(input: Input) {
  return input;
}`;
}

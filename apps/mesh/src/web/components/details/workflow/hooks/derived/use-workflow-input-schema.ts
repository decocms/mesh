import type { Step } from "@decocms/bindings/workflow";
import { useWorkflow } from "../../stores/workflow";
import type { JsonSchema } from "@/web/utils/constants";

/**
 * Extract all @input.field references from a value recursively.
 * Returns the field paths after @input (e.g., "user_id" from "@input.user_id")
 */
function extractInputRefs(value: unknown): string[] {
  const refs: string[] = [];

  function traverse(val: unknown) {
    if (typeof val === "string") {
      // Match @input or @input.field patterns
      const matches = val.match(/@input(?:\.(\w+(?:\.\w+)*))?/g);
      if (matches) {
        for (const match of matches) {
          if (match === "@input") {
            // Reference to entire input object
            refs.push("__entire_input__");
          } else {
            // Extract field path after @input.
            const fieldPath = match.replace("@input.", "");
            refs.push(fieldPath);
          }
        }
      }
    } else if (Array.isArray(val)) {
      val.forEach(traverse);
    } else if (typeof val === "object" && val !== null) {
      Object.values(val).forEach(traverse);
    }
  }

  traverse(value);
  return [...new Set(refs)];
}

/**
 * Get all @input refs from all steps in the workflow.
 * Returns unique field names that the workflow expects as input.
 */
function getWorkflowInputFields(steps: Step[]): string[] {
  const allRefs: string[] = [];

  for (const step of steps) {
    const stepRefs = extractInputRefs(step.input);
    allRefs.push(...stepRefs);
  }

  // Remove duplicates and filter out special __entire_input__ marker
  return [...new Set(allRefs)].filter((ref) => ref !== "__entire_input__");
}

/**
 * Check if the workflow references the entire @input object (not just fields).
 */
function workflowUsesEntireInput(steps: Step[]): boolean {
  for (const step of steps) {
    const stepRefs = extractInputRefs(step.input);
    if (stepRefs.includes("__entire_input__")) {
      return true;
    }
  }
  return false;
}

/**
 * Build a JSON Schema from the @input field references in the workflow.
 * Each referenced field becomes a property in the schema.
 *
 * For now, all fields are typed as strings since we don't have type information.
 * In the future, we could infer types from usage context.
 */
function buildWorkflowInputSchema(steps: Step[]): JsonSchema | null {
  const fields = getWorkflowInputFields(steps);

  if (fields.length === 0) {
    // Check if the workflow uses the entire @input object
    if (workflowUsesEntireInput(steps)) {
      // Return an open object schema
      return {
        type: "object",
        additionalProperties: true,
        description: "Workflow input data",
      };
    }
    return null;
  }

  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const field of fields) {
    // Handle nested fields like "user.name" → nested object
    const parts = field.split(".");

    if (parts.length === 1) {
      // Simple field
      properties[field] = {
        type: "string",
        description: `Input field: ${field}`,
      };
      required.push(field);
    } else {
      // Nested field - for now, just use the top-level key
      const topLevel = parts[0];
      if (topLevel && !properties[topLevel]) {
        properties[topLevel] = {
          type: "object",
          description: `Input object: ${topLevel}`,
          additionalProperties: true,
        };
        required.push(topLevel);
      }
    }
  }

  return {
    type: "object",
    properties,
    required,
    description: "Workflow execution input",
  };
}

/**
 * Hook that returns the computed input schema for the current workflow.
 * Returns null if the workflow doesn't reference any @input fields.
 */
export function useWorkflowInputSchema(): JsonSchema | null {
  const workflow = useWorkflow();
  return buildWorkflowInputSchema(workflow.steps);
}

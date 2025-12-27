import type { JsonSchema } from "@/web/utils/constants";
import {
  useSelectedPaths,
  useOutputSchemaActions,
  useOutputSchema,
  buildSelectedSchema,
} from "../../../stores/output-schema-selection.ts";

/**
 * Hook that provides the current selection state and actions.
 */
export function useOutputSchemaSelection() {
  const schema = useOutputSchema();
  const selectedPaths = useSelectedPaths();
  const actions = useOutputSchemaActions();

  const selectedPathsSet = new Set(selectedPaths);

  return {
    schema,
    selectedPaths,
    ...actions,

    /**
     * Get the filtered schema containing only selected properties.
     */
    getSelectedSchema: (): JsonSchema | null => {
      return buildSelectedSchema(schema, selectedPathsSet);
    },

    /**
     * Check if all properties are selected.
     */
    isAllSelected: selectedPaths.length > 0,

    /**
     * Get count of selected properties.
     */
    selectedCount: selectedPaths.length,
  };
}

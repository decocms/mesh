import { createStore, StoreApi } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/vanilla/shallow";
import { createContext, useContext } from "react";
import type { JsonSchema } from "@/web/utils/constants";

export interface PropertyPath {
  path: string;
  type: string | undefined;
  isRequired: boolean;
}

interface State {
  schema: JsonSchema;
  selectedPaths: Set<string>;
}

interface Actions {
  togglePath: (path: string) => void;
  selectPath: (path: string) => void;
  deselectPath: (path: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  isSelected: (path: string) => boolean;
}

interface Store extends State {
  actions: Actions;
}

/**
 * Extract all property paths from a JSON schema recursively.
 * Returns paths for leaf properties and intermediate object/array paths.
 */
function extractAllPaths(
  schema: JsonSchema,
  prefix = "",
  requiredFields: string[] = [],
): PropertyPath[] {
  const paths: PropertyPath[] = [];

  if (schema.type === "object" && schema.properties) {
    const required = schema.required ?? [];
    for (const [key, prop] of Object.entries(schema.properties)) {
      const currentPath = prefix ? `${prefix}.${key}` : key;
      const isRequired = required.includes(key) || requiredFields.includes(key);

      paths.push({
        path: currentPath,
        type: prop.type,
        isRequired,
      });

      // Recursively extract nested paths
      if (prop.type === "object" || prop.type === "array") {
        const nested = extractAllPaths(
          prop.type === "array" && prop.items ? prop.items : prop,
          currentPath,
          prop.required ?? [],
        );
        paths.push(...nested);
      }
    }
  }

  if (schema.type === "array" && schema.items) {
    const nested = extractAllPaths(
      schema.items,
      prefix,
      schema.items.required ?? [],
    );
    paths.push(...nested);
  }

  return paths;
}

/**
 * Get initial selected paths based on required fields.
 */
function getInitialSelectedPaths(schema: JsonSchema): Set<string> {
  const allPaths = extractAllPaths(schema);
  const requiredPaths = allPaths.filter((p) => p.isRequired).map((p) => p.path);
  return new Set(requiredPaths);
}

export const OutputSchemaSelectionContext =
  createContext<StoreApi<Store> | null>(null);

export function createOutputSchemaSelectionStore(schema: JsonSchema) {
  const allPaths = extractAllPaths(schema);

  return createStore<Store>()((set, get) => ({
    schema,
    selectedPaths: getInitialSelectedPaths(schema),
    actions: {
      togglePath: (path: string) =>
        set((state) => {
          const newSelected = new Set(state.selectedPaths);
          if (newSelected.has(path)) {
            newSelected.delete(path);
          } else {
            newSelected.add(path);
          }
          return { selectedPaths: newSelected };
        }),

      selectPath: (path: string) =>
        set((state) => {
          const newSelected = new Set(state.selectedPaths);
          newSelected.add(path);
          return { selectedPaths: newSelected };
        }),

      deselectPath: (path: string) =>
        set((state) => {
          const newSelected = new Set(state.selectedPaths);
          newSelected.delete(path);
          return { selectedPaths: newSelected };
        }),

      selectAll: () =>
        set(() => ({
          selectedPaths: new Set(allPaths.map((p) => p.path)),
        })),

      deselectAll: () =>
        set(() => ({
          selectedPaths: new Set(),
        })),

      isSelected: (path: string) => get().selectedPaths.has(path),
    },
  }));
}

function useOutputSchemaSelectionStore<T>(
  selector: (state: Store) => T,
  equalityFn?: (a: T, b: T) => boolean,
): T {
  const store = useContext(OutputSchemaSelectionContext);
  if (!store) {
    throw new Error(
      "Missing OutputSchemaSelectionProvider - wrap your component tree with the provider.",
    );
  }
  return useStoreWithEqualityFn(store, selector, equalityFn ?? shallow);
}

/**
 * Hook to get selected paths as an array.
 */
export function useSelectedPaths(): string[] {
  return useOutputSchemaSelectionStore((state) =>
    Array.from(state.selectedPaths),
  );
}

/**
 * Hook to get store actions.
 */
export function useOutputSchemaActions(): Actions {
  return useOutputSchemaSelectionStore((state) => state.actions);
}

/**
 * Hook to check if a specific path is selected.
 */
export function useIsPathSelected(path: string): boolean {
  return useOutputSchemaSelectionStore((state) =>
    state.selectedPaths.has(path),
  );
}

/**
 * Hook to get the schema.
 */
export function useOutputSchema(): JsonSchema {
  return useOutputSchemaSelectionStore((state) => state.schema);
}

/**
 * Utility function to build a filtered schema based on selected paths.
 * This can be called outside React context if you have the selected paths.
 */
export function buildSelectedSchema(
  schema: JsonSchema,
  selectedPaths: Set<string>,
  currentPath = "",
): JsonSchema | null {
  if (schema.type === "object" && schema.properties) {
    const filteredProperties: Record<string, JsonSchema> = {};
    const filteredRequired: string[] = [];

    for (const [key, prop] of Object.entries(schema.properties)) {
      const propertyPath = currentPath ? `${currentPath}.${key}` : key;

      if (selectedPaths.has(propertyPath)) {
        if (prop.type === "object" || prop.type === "array") {
          const nestedSchema = buildSelectedSchema(
            prop,
            selectedPaths,
            propertyPath,
          );
          if (nestedSchema) {
            filteredProperties[key] = nestedSchema;
            if (schema.required?.includes(key)) {
              filteredRequired.push(key);
            }
          }
        } else {
          filteredProperties[key] = prop;
          if (schema.required?.includes(key)) {
            filteredRequired.push(key);
          }
        }
      }
    }

    if (Object.keys(filteredProperties).length === 0) {
      return null;
    }

    return {
      ...schema,
      properties: filteredProperties,
      required: filteredRequired.length > 0 ? filteredRequired : undefined,
    };
  }

  if (schema.type === "array" && schema.items) {
    const filteredItems = buildSelectedSchema(
      schema.items,
      selectedPaths,
      currentPath,
    );
    if (!filteredItems) {
      return null;
    }
    return {
      ...schema,
      items: filteredItems,
    };
  }

  return schema;
}

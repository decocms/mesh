import { useState, type PropsWithChildren } from "react";
import type { JsonSchema } from "@/web/utils/constants";
import {
  createOutputSchemaSelectionStore,
  OutputSchemaSelectionContext,
} from "../../stores/output-schema-selection";

interface OutputSchemaProviderProps extends PropsWithChildren {
  schema: JsonSchema | undefined;
}

export function OutputSchemaProvider({
  schema,
  children,
}: OutputSchemaProviderProps) {
  const [store] = useState(() =>
    createOutputSchemaSelectionStore(schema ?? {}),
  );
  if (!schema) {
    return null;
  }
  return (
    <OutputSchemaSelectionContext.Provider value={store}>
      {children}
    </OutputSchemaSelectionContext.Provider>
  );
}

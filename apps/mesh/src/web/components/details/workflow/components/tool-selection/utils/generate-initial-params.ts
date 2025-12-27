import type { JsonSchema } from "@/web/utils/constants";
import { generateDefaultValue } from "./generate-default-value";

export function generateInitialParams(
  inputSchema: JsonSchema,
): Record<string, unknown> {
  const initialParams: Record<string, unknown> = {};
  const inputSchemaProperties = inputSchema?.properties;
  const requiredKeys = inputSchema?.required ?? [];
  if (inputSchemaProperties) {
    Object.entries(inputSchemaProperties).forEach(([key, propSchema]) => {
      // Only include required fields at the top level
      if (requiredKeys.includes(key)) {
        initialParams[key] = generateDefaultValue(
          propSchema as JsonSchema,
          true,
        );
      }
    });
  }
  return initialParams;
}

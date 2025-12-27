import type { JsonSchema } from "@/web/utils/constants";

/**
 * Prepares tool arguments by:
 * - Removing empty optional fields
 * - Parsing JSON strings for object/array types
 */
export function prepareToolArgs(
  inputParams: Record<string, unknown>,
  inputSchema: JsonSchema,
): Record<string, unknown> {
  const args = { ...inputParams };
  if (!inputSchema?.properties) {
    return args;
  }

  Object.entries(inputSchema.properties).forEach(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ([key, prop]: [string, any]) => {
      const required = inputSchema.required?.includes(key);
      const notRequiredAndEmpty = !required && !args[key];
      if (notRequiredAndEmpty) {
        delete args[key];
        return;
      }
      if (
        (prop.type === "object" || prop.type === "array") &&
        typeof args[key] === "string"
      ) {
        try {
          args[key] = JSON.parse(args[key]);
        } catch {
          // Parsing failed, send as string (will likely fail validation but let server handle it)
        }
      }
    },
  );

  return args;
}

import type { JsonSchema } from "@/web/utils/constants";

export function generateDefaultValue(
  schema: JsonSchema,
  onlyRequired = true,
): unknown {
  if (!schema) return "";

  // Handle union types (anyOf/oneOf) - use the first schema that looks like an object or the first one
  if (schema.anyOf || schema.oneOf) {
    const unionSchemas = (schema.anyOf || schema.oneOf) as JsonSchema[];
    // Prefer object type schemas, then array, then fall back to first
    const objectSchema = unionSchemas.find((s) => s.type === "object");
    const arraySchema = unionSchemas.find((s) => s.type === "array");
    const schemaToUse = objectSchema || arraySchema || unionSchemas[0];
    if (schemaToUse) {
      return generateDefaultValue(schemaToUse, onlyRequired);
    }
  }

  // If schema has properties but no explicit type, treat as object
  if (!schema.type && schema.properties) {
    const obj: Record<string, unknown> = {};
    const requiredKeys = schema.required ?? [];
    Object.entries(schema.properties).forEach(([key, propSchema]) => {
      if (!onlyRequired || requiredKeys.includes(key)) {
        obj[key] = generateDefaultValue(propSchema as JsonSchema, false);
      }
    });
    return obj;
  }

  switch (schema.type) {
    case "object": {
      const obj: Record<string, unknown> = {};
      if (schema.properties) {
        const requiredKeys = schema.required ?? [];
        Object.entries(schema.properties).forEach(([key, propSchema]) => {
          // Only include required fields when onlyRequired is true
          if (!onlyRequired || requiredKeys.includes(key)) {
            // For nested objects, always include required properties (pass false for deeper nesting)
            obj[key] = generateDefaultValue(propSchema as JsonSchema, false);
          }
        });
      }
      return obj;
    }
    case "array": {
      // Return empty array - don't pre-populate with items
      return [];
    }
    case "number":
    case "integer": {
      return 0;
    }
    case "boolean": {
      return false;
    }
    case "string":
    default: {
      return "";
    }
  }
}

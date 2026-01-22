/**
 * Shared utilities for MCP Configuration Form
 */

/**
 * Check if a schema property represents a binding field.
 */
export function isBindingField(schema: Record<string, unknown>): boolean {
  const properties = schema.properties as Record<string, unknown> | undefined;
  if (!properties) return false;

  const typeProperty = properties.__type as Record<string, unknown> | undefined;
  const bindingProperty = properties.__binding as
    | Record<string, unknown>
    | undefined;

  return !!(typeProperty?.const || bindingProperty?.const);
}

/**
 * Extract binding info from schema.
 */
export function getBindingInfo(schema: Record<string, unknown>): {
  bindingType?: string;
  bindingSchema?: unknown;
} {
  const properties = schema.properties as Record<string, unknown> | undefined;
  if (!properties) return {};

  const typeProperty = properties.__type as Record<string, unknown> | undefined;
  const bindingProperty = properties.__binding as
    | Record<string, unknown>
    | undefined;

  return {
    bindingType: typeProperty?.const as string | undefined,
    bindingSchema: bindingProperty?.const,
  };
}

/**
 * Extract field name from child element id.
 * e.g., "root_llm___type" -> "llm", "root_model_value" -> "model"
 */
export function extractFieldName(childId: string): string {
  const withoutRoot = childId.replace(/^root_/, "");
  const parts = withoutRoot.split("_");
  return parts[0] || "";
}

/**
 * Check if a binding schema value represents an MCP Server name that needs dynamic resolution.
 * @example "@deco/database" -> true, "deco/database" -> true, [{name: "TOOL"}] -> false
 */
export function isDynamicBindingSchema(
  bindingSchema: unknown,
): bindingSchema is string {
  if (typeof bindingSchema !== "string") return false;
  const normalized = bindingSchema.startsWith("@")
    ? bindingSchema.slice(1)
    : bindingSchema;
  return normalized.includes("/");
}

/**
 * Format a field name to title case.
 * e.g., "BOT_TOKEN" -> "Bot Token", "my_field" -> "My Field"
 */
export function formatTitle(str: string): string {
  return str
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Check if a schema represents a nested object (not a binding, not root).
 */
export function isNestedObjectSchema(
  schema: Record<string, unknown>,
  title?: string,
): boolean {
  if (!title) return false;
  if (schema.type !== "object") return false;
  if (isBindingField(schema)) return false;
  return true;
}

/**
 * Form context interface for field changes.
 */
export interface FormContext {
  onFieldChange: (fieldPath: string, value: unknown) => void;
  formData: Record<string, unknown>;
  onAddNew: () => void;
}


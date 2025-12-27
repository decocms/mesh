import { MentionItem } from "@/web/components/tiptap-mentions-input";

/**
 * Converts a JSON schema to mention items for use in mention inputs.
 * Recursively processes object properties and array items to create
 * a hierarchical structure of mentionable fields.
 *
 * @param schema - The JSON schema to convert
 * @param prefix - Optional prefix to prepend to field names (for nested objects)
 * @returns Array of mention items representing the schema structure
 */
export function convertJsonSchemaToMentionItems(
  schema: Record<string, unknown>,
  prefix = "",
): MentionItem[] {
  if (schema?.type === "object" && schema?.properties) {
    return Object.entries(schema.properties as Record<string, unknown>).map(
      ([key, value]) => {
        const children = convertJsonSchemaToMentionItems(
          value as Record<string, unknown>,
          `${prefix}${key}.`,
        );
        return {
          id: `${prefix}${key}`,
          label: key,
          ...(children.length > 0 && { children }),
        };
      },
    );
  }
  if (schema?.type === "array" && schema?.items) {
    const itemSchema = schema?.items as Record<string, unknown>;
    return convertJsonSchemaToMentionItems(itemSchema, prefix);
  }
  return [];
}

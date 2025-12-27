import type { JsonSchema } from "@/web/utils/constants";
import type { MentionItem } from "@/web/components/tiptap-mentions-input";
import { MentionInput } from "@/web/components/tiptap-mentions-input";

/**
 * Renders a clean readonly view of form data with mention tooltips
 */
export function ReadonlyToolInput({
  inputSchema,
  inputParams,
  mentions,
}: {
  inputSchema: JsonSchema;
  inputParams?: Record<string, unknown>;
  mentions: MentionItem[];
}) {
  if (!inputSchema?.properties || !inputParams) {
    return null;
  }

  const renderValue = (key: string, value: unknown, schema: JsonSchema) => {
    // Convert value to string for display
    const valueStr =
      typeof value === "object" && value !== null
        ? JSON.stringify(value, null, 2)
        : String(value ?? "");

    const schemaType = Array.isArray(schema.type)
      ? schema.type.join(" | ")
      : (schema.type ?? "string");

    return (
      <div key={key} className="space-y-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">{key}</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {schemaType}
          </span>
        </div>
        {schema.description && (
          <div className="text-xs text-muted-foreground">
            {schema.description}
          </div>
        )}
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <MentionInput
            mentions={mentions}
            value={valueStr}
            readOnly
            className="border-0 bg-transparent p-0"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {Object.entries(inputSchema.properties).map(([key, propSchema]) => {
        const value = inputParams[key];
        return renderValue(key, value, propSchema as JsonSchema);
      })}
    </div>
  );
}

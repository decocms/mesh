/**
 * Custom RJSF Widgets for CMS Block Prop Editor
 *
 * Adapted from the Mesh workflow RJSF widgets.
 * Uses @deco/ui components instead of workflow-specific MentionInput.
 */

import type { WidgetProps, RegistryWidgetsType } from "@rjsf/utils";
import { Input } from "@deco/ui/components/input.tsx";
import { Checkbox } from "@deco/ui/components/checkbox.tsx";
import { cn } from "@deco/ui/lib/utils.ts";

/**
 * TextWidget - uses @deco/ui Input.
 * Supports URL format and multiline via textarea fallback.
 */
function CustomTextWidget(props: WidgetProps) {
  const { value, onChange, placeholder, readonly, id, schema } = props;

  const isUrl = schema.format === "uri" || schema.format === "url";
  const isMultiline =
    (schema as Record<string, unknown>)["ui:widget"] === "textarea" ||
    (typeof schema.description === "string" &&
      schema.description.toLowerCase().includes("multiline"));

  if (isMultiline) {
    return (
      <textarea
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        placeholder={placeholder || "Enter value..."}
        disabled={readonly}
        rows={4}
        className={cn(
          "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
          "ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "resize-y min-h-[80px]",
        )}
      />
    );
  }

  return (
    <Input
      id={id}
      type={isUrl ? "url" : "text"}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      placeholder={placeholder || "Enter value..."}
      disabled={readonly}
    />
  );
}

/**
 * NumberWidget - uses @deco/ui Input with type="number".
 * Handles min/max from schema.
 */
function CustomNumberWidget(props: WidgetProps) {
  const { value, onChange, readonly, id, schema } = props;

  return (
    <Input
      id={id}
      type="number"
      value={value ?? ""}
      onChange={(e) =>
        onChange(e.target.value === "" ? undefined : Number(e.target.value))
      }
      min={schema.minimum}
      max={schema.maximum}
      disabled={readonly}
    />
  );
}

/**
 * CheckboxWidget - uses @deco/ui Checkbox with label.
 */
function CustomCheckboxWidget(props: WidgetProps) {
  const { value, onChange, readonly, id, label } = props;

  return (
    <label htmlFor={id} className="flex items-center gap-2 cursor-pointer">
      <Checkbox
        id={id}
        checked={value ?? false}
        onCheckedChange={(checked) => onChange(checked)}
        disabled={readonly}
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}

/**
 * SelectWidget - renders enum values as a native select.
 */
function CustomSelectWidget(props: WidgetProps) {
  const { value, onChange, readonly, id, options } = props;
  const enumOptions = options.enumOptions ?? [];

  return (
    <select
      id={id}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={readonly}
      className={cn(
        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
        "ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <option value="">Select...</option>
      {enumOptions.map((opt) => (
        <option key={String(opt.value)} value={String(opt.value)}>
          {String(opt.label)}
        </option>
      ))}
    </select>
  );
}

// Custom widgets registry
export const customWidgets: RegistryWidgetsType = {
  TextWidget: CustomTextWidget,
  NumberWidget: CustomNumberWidget,
  CheckboxWidget: CustomCheckboxWidget,
  SelectWidget: CustomSelectWidget,
};

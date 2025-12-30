import { cn } from "@deco/ui/lib/utils.ts";
import type { WidgetProps, RegistryWidgetsType } from "@rjsf/utils";
import { MentionInput } from "@/web/components/tiptap-mentions-input";
import { useMentions } from "./rjsf-context";

/**
 * Text widget using MentionInput
 */
function MentionTextWidget(props: WidgetProps) {
  const { value, onChange, placeholder, readonly } = props;
  const mentions = useMentions();

  return (
    <MentionInput
      mentions={mentions}
      value={value ?? ""}
      onChange={(v) => onChange(v)}
      placeholder={placeholder || `Enter value...`}
      readOnly={readonly}
    />
  );
}

/**
 * Textarea widget using MentionInput with multiline styling
 */
function MentionTextareaWidget(props: WidgetProps) {
  const { value, onChange, placeholder, readonly } = props;
  const mentions = useMentions();

  return (
    <MentionInput
      mentions={mentions}
      value={value ?? ""}
      onChange={(v) => onChange(v)}
      placeholder={placeholder || `Enter value...`}
      readOnly={readonly}
      className="min-h-[80px]"
    />
  );
}

/**
 * Number widget
 */
function NumberWidget(props: WidgetProps) {
  const { value, onChange, readonly, id } = props;

  return (
    <input
      id={id}
      type="number"
      value={value ?? ""}
      onChange={(e) =>
        onChange(e.target.value === "" ? undefined : Number(e.target.value))
      }
      disabled={readonly}
      className={cn(
        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
        "ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    />
  );
}

/**
 * Checkbox widget
 */
function CheckboxWidget(props: WidgetProps) {
  const { value, onChange, readonly, id, label } = props;

  return (
    <label htmlFor={id} className="flex items-center gap-2 cursor-pointer">
      <input
        id={id}
        type="checkbox"
        checked={value ?? false}
        onChange={(e) => onChange(e.target.checked)}
        disabled={readonly}
        className="h-4 w-4 rounded border-input"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}

/**
 * Select widget
 */
function SelectWidget(props: WidgetProps) {
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
  TextWidget: MentionTextWidget,
  TextareaWidget: MentionTextareaWidget,
  NumberWidget: NumberWidget,
  CheckboxWidget: CheckboxWidget,
  SelectWidget: SelectWidget,
};

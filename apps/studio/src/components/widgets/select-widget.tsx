import type { WidgetProps } from "@rjsf/utils";

export function SelectWidget(props: WidgetProps) {
  const { id, value, required, disabled, readonly, onChange, options } = props;

  const enumOptions = options.enumOptions ?? [];

  return (
    <select
      id={id}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      disabled={disabled || readonly}
      required={required}
      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="">Select an option...</option>
      {enumOptions.map((option) => (
        <option key={String(option.value)} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

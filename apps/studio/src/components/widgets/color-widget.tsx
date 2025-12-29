import type { WidgetProps } from "@rjsf/utils";
import { Input } from "../ui/input";

export function ColorWidget(props: WidgetProps) {
  const { id, value, required, disabled, readonly, onChange } = props;

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <input
          type="color"
          id={`${id}-picker`}
          value={value ?? "#000000"}
          disabled={disabled || readonly}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-input bg-transparent p-1"
        />
      </div>
      <Input
        id={id}
        type="text"
        value={value ?? ""}
        required={required}
        disabled={disabled || readonly}
        placeholder="#000000"
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 font-mono text-sm"
      />
    </div>
  );
}


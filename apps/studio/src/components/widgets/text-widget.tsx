import type { WidgetProps } from "@rjsf/utils";
import { Input } from "../ui/input";

export function TextWidget(props: WidgetProps) {
  const { id, value, required, disabled, readonly, onChange, onBlur, onFocus, placeholder } = props;

  return (
    <Input
      id={id}
      type="text"
      value={value ?? ""}
      required={required}
      disabled={disabled || readonly}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      onBlur={() => onBlur(id, value)}
      onFocus={() => onFocus(id, value)}
      className="w-full"
    />
  );
}


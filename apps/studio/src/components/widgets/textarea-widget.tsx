import type { WidgetProps } from "@rjsf/utils";
import { Textarea } from "../ui/textarea";

export function TextareaWidget(props: WidgetProps) {
  const { id, value, required, disabled, readonly, onChange, onBlur, onFocus, placeholder } = props;

  return (
    <Textarea
      id={id}
      value={value ?? ""}
      required={required}
      disabled={disabled || readonly}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
      onBlur={() => onBlur(id, value)}
      onFocus={() => onFocus(id, value)}
      className="w-full min-h-[100px] resize-y"
      rows={4}
    />
  );
}


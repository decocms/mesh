import type { BaseInputTemplateProps } from "@rjsf/utils";
import { Input } from "../ui/input";

export function BaseInputTemplate(props: BaseInputTemplateProps) {
  const {
    id,
    type,
    value,
    required,
    disabled,
    readonly,
    onChange,
    onBlur,
    onFocus,
    placeholder,
    autofocus,
  } = props;

  const inputType = type === "integer" ? "number" : type;

  return (
    <Input
      id={id}
      type={inputType}
      value={value ?? ""}
      required={required}
      disabled={disabled || readonly}
      placeholder={placeholder}
      autoFocus={autofocus}
      onChange={(e) => {
        const val = e.target.value;
        if (type === "number" || type === "integer") {
          onChange(val === "" ? undefined : Number(val));
        } else {
          onChange(val === "" ? undefined : val);
        }
      }}
      onBlur={() => onBlur(id, value)}
      onFocus={() => onFocus(id, value)}
      className="w-full"
    />
  );
}


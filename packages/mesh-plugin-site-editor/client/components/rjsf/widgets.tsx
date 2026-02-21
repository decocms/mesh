import type { WidgetProps, RegistryWidgetsType } from "@rjsf/utils";
import { Input } from "@deco/ui/components/input.tsx";
import { Checkbox } from "@deco/ui/components/checkbox.tsx";
import { Label } from "@deco/ui/components/label.tsx";

function TextWidget({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  readonly,
}: WidgetProps) {
  return (
    <Input
      id={id}
      value={value ?? ""}
      onChange={(e) =>
        onChange(e.target.value === "" ? undefined : e.target.value)
      }
      placeholder={placeholder}
      disabled={disabled || readonly}
      className="h-7 text-sm"
    />
  );
}

function NumberWidget({
  id,
  value,
  onChange,
  disabled,
  readonly,
}: WidgetProps) {
  return (
    <Input
      id={id}
      type="number"
      value={value ?? ""}
      onChange={(e) => {
        const n = parseFloat(e.target.value);
        onChange(isNaN(n) ? undefined : n);
      }}
      disabled={disabled || readonly}
      className="h-7 text-sm"
    />
  );
}

function CheckboxWidget({
  id,
  value,
  onChange,
  label,
  disabled,
  readonly,
}: WidgetProps) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={!!value}
        onCheckedChange={(checked) => onChange(!!checked)}
        disabled={disabled || readonly}
      />
      {label && (
        <Label htmlFor={id} className="text-sm font-normal">
          {label}
        </Label>
      )}
    </div>
  );
}

function URLWidget({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  readonly,
}: WidgetProps) {
  return (
    <Input
      id={id}
      type="url"
      value={value ?? ""}
      onChange={(e) =>
        onChange(e.target.value === "" ? undefined : e.target.value)
      }
      placeholder={placeholder ?? "https://"}
      disabled={disabled || readonly}
      className="h-7 text-sm"
    />
  );
}

export const customWidgets: RegistryWidgetsType = {
  TextWidget,
  text: TextWidget,
  NumberWidget,
  number: NumberWidget,
  CheckboxWidget,
  checkbox: CheckboxWidget,
  URLWidget,
  uri: URLWidget,
};

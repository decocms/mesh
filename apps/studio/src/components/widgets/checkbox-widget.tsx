import type { WidgetProps } from "@rjsf/utils";
import { Label } from "../ui/label";

export function CheckboxWidget(props: WidgetProps) {
  const { id, value, disabled, readonly, onChange, label } = props;

  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        id={id}
        checked={value ?? false}
        disabled={disabled || readonly}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border border-primary text-primary focus:ring-primary"
      />
      {label && (
        <Label htmlFor={id} className="text-sm font-normal cursor-pointer">
          {label}
        </Label>
      )}
    </div>
  );
}

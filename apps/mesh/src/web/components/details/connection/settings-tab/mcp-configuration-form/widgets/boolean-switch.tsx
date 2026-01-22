/**
 * Boolean Switch Widget
 *
 * Renders boolean fields as a toggle switch instead of a checkbox.
 */

import { Switch } from "@deco/ui/components/switch.tsx";
import type { WidgetProps } from "@rjsf/utils";

export function BooleanSwitchWidget({
  value,
  onChange,
  schema,
  disabled,
  readonly,
}: WidgetProps) {
  const checked = value ?? (schema.default as boolean | undefined) ?? false;

  return (
    <Switch
      checked={checked}
      onCheckedChange={(newValue) => onChange(newValue)}
      disabled={disabled || readonly}
    />
  );
}


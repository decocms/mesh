/**
 * Boolean Switch Widget
 *
 * Renders boolean fields as a toggle switch.
 * Layout: Switch on left, label next to it.
 */

import { Switch } from "@deco/ui/components/switch.tsx";
import type { WidgetProps } from "@rjsf/utils";

export function BooleanSwitchWidget({
  value,
  onChange,
  schema,
  disabled,
  readonly,
  id,
}: WidgetProps) {
  const checked = value ?? (schema.default as boolean | undefined) ?? false;

  return (
    <Switch
      id={id}
      checked={checked}
      onCheckedChange={(newValue) => onChange(newValue)}
      disabled={disabled || readonly}
    />
  );
}

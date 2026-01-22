/**
 * Boolean Switch Widget
 *
 * Renders boolean fields as a styled checkbox.
 */

import { Checkbox } from "@deco/ui/components/checkbox.tsx";
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
    <Checkbox
      id={id}
      checked={checked}
      onCheckedChange={(newValue) => onChange(newValue === true)}
      disabled={disabled || readonly}
    />
  );
}

/**
 * Widget Registry
 *
 * Central registry for all custom RJSF widgets.
 * To add a new widget:
 * 1. Create the widget component in this folder
 * 2. Import and add it to customWidgets below
 */

import type { RegistryWidgetsType } from "@rjsf/utils";
import { BooleanSwitchWidget } from "./boolean-switch";
import { ReadonlyStringWidget } from "./readonly-string";

/**
 * Custom widgets that override RJSF defaults.
 * Keys are RJSF widget names (e.g., "CheckboxWidget" overrides default checkbox).
 */
export const customWidgets: RegistryWidgetsType = {
  // Override default checkbox with toggle switch
  CheckboxWidget: BooleanSwitchWidget,
  // Custom widget for readonly strings
  ReadonlyWidget: ReadonlyStringWidget,
};

// Re-export individual widgets for direct use
export { BooleanSwitchWidget } from "./boolean-switch";
export { ReadonlyStringWidget } from "./readonly-string";


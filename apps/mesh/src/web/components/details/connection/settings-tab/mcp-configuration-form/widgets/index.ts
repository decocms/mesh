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
import { BaseInputWidget, NumberInputWidget, TextInputWidget } from "./base-input";

/**
 * Custom widgets that override RJSF defaults.
 */
export const customWidgets: RegistryWidgetsType = {
  // Boolean toggle
  CheckboxWidget: BooleanSwitchWidget,

  // Text inputs with debounce
  TextWidget: TextInputWidget,
  BaseInput: BaseInputWidget,

  // Number inputs
  NumberWidget: NumberInputWidget,
  IntegerWidget: NumberInputWidget,

  // Readonly string with copy button
  ReadOnlyWidget: ReadonlyStringWidget,
};

// Re-export individual widgets for direct use
export { BooleanSwitchWidget } from "./boolean-switch";
export { ReadonlyStringWidget } from "./readonly-string";
export { BaseInputWidget, NumberInputWidget, TextInputWidget } from "./base-input";

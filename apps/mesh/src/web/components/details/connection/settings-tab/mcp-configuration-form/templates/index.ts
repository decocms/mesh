/**
 * Template Registry
 *
 * Central registry for all custom RJSF templates.
 * To add a new template:
 * 1. Create the template component in this folder
 * 2. Import and add it to customTemplates below
 */

import type { TemplatesType } from "@rjsf/utils";
import { CustomObjectFieldTemplate } from "./object-template";
import { CustomFieldTemplate } from "./field-template";
import { CustomArrayFieldTemplate } from "./array-template";

/**
 * Custom templates that override RJSF defaults.
 */
export const customTemplates: Partial<TemplatesType> = {
  ObjectFieldTemplate: CustomObjectFieldTemplate,
  FieldTemplate: CustomFieldTemplate,
  ArrayFieldTemplate: CustomArrayFieldTemplate,
};

// Re-export individual templates for direct use
export { CustomObjectFieldTemplate } from "./object-template";
export { CustomFieldTemplate } from "./field-template";
export { CustomArrayFieldTemplate } from "./array-template";
export { BindingFieldRenderer } from "./binding-field-renderer";


/**
 * Field Template
 *
 * Base wrapper for individual form fields.
 * Handles label, description, and special cases.
 *
 * Layouts:
 * - Boolean: [Switch] Label + Description below
 * - Others: Label, Description, Input (vertical stack)
 */

import type { FieldTemplateProps } from "@rjsf/utils";
import { ReadonlyStringWidget } from "../widgets/readonly-string";

export function CustomFieldTemplate(props: FieldTemplateProps) {
  const { label, children, description, id, schema, formData } = props;

  // Hide internal binding fields
  if (id.includes("__type") || id.includes("__binding")) {
    return null;
  }

  // Object fields are handled by ObjectFieldTemplate
  if (schema.type === "object") {
    return children;
  }

  // Boolean fields - horizontal layout with switch on left
  if (schema.type === "boolean") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          {children}
          {label && (
            <label className="text-sm font-medium cursor-pointer" htmlFor={id}>
              {label}
            </label>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground pl-[44px]">
            {description}
          </p>
        )}
      </div>
    );
  }

  // Handle readonly string fields with copy button
  if (schema.readOnly && schema.type === "string") {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm font-medium" htmlFor={id}>
            {label}
          </label>
        )}
        {description && (
          <p className="text-xs text-muted-foreground">
            {description}
          </p>
        )}
        <div className="max-w-md">
          <ReadonlyStringWidget
            id={id}
            value={formData ?? schema.default}
            schema={schema}
            onChange={() => {}}
            onBlur={() => {}}
            onFocus={() => {}}
            options={{}}
            registry={props.registry}
            label={label || ""}
            required={props.required}
            disabled={props.disabled}
            readonly={true}
            autofocus={false}
            placeholder=""
            rawErrors={[]}
            uiSchema={{}}
            formContext={{}}
            name=""
          />
        </div>
      </div>
    );
  }

  // Default field layout - vertical stack with constrained width
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium" htmlFor={id}>
          {label}
        </label>
      )}
      {description && (
        <p className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
      <div className="max-w-md">{children}</div>
    </div>
  );
}

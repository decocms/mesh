/**
 * Field Template
 *
 * Base wrapper for individual form fields.
 * Handles label, description, and special cases like readonly fields.
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

  // Handle readonly string fields with copy button
  if (schema.readOnly && schema.type === "string") {
    return (
      <div className="flex items-center gap-3 justify-between">
        <div className="flex-1 min-w-0">
          {label && (
            <label className="text-sm font-medium truncate block" htmlFor={id}>
              {label}
            </label>
          )}
          {description && (
            <p className="text-xs text-muted-foreground truncate">
              {description}
            </p>
          )}
        </div>
        <div className="w-[250px] shrink-0">
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

  // Default field layout
  return (
    <div className="flex items-center gap-3 justify-between">
      <div className="flex-1 min-w-0">
        {label && (
          <label className="text-sm font-medium truncate block" htmlFor={id}>
            {label}
          </label>
        )}
        {description && (
          <p className="text-xs text-muted-foreground truncate">
            {description}
          </p>
        )}
      </div>
      <div className="w-[200px] shrink-0">{children}</div>
    </div>
  );
}


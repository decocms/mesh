/**
 * Field Template
 *
 * Base wrapper for individual form fields.
 * Handles label, description, and different field types.
 * Based on admin-panel-cx FieldTemplate.
 */

import type { FieldTemplateProps } from "@rjsf/utils";
import { Label } from "../components/label";
import { ReadonlyStringWidget } from "../widgets/readonly-string";

// Fields that should not show labels
const LABELS_TO_HIDE = ["__resolveType", "__resolve Type", "__type"];

// Fields that should be completely hidden
const FIELDS_TO_HIDE = ["__type", "__binding"];

export function CustomFieldTemplate(props: FieldTemplateProps) {
  const {
    id,
    label,
    children,
    description,
    required,
    readonly,
    disabled,
    schema,
    formData,
    classNames,
  } = props;

  // Check if field should be hidden
  const shouldHideField =
    FIELDS_TO_HIDE.some((hidden) => id.includes(hidden)) ||
    schema.hide !== undefined;

  if (shouldHideField) {
    return null;
  }

  // Object fields are handled by ObjectFieldTemplate
  if (schema.type === "object") {
    return children;
  }

  // Array fields are handled by ArrayFieldTemplate
  if (schema.type === "array") {
    return children;
  }

  // Check if should render label
  const shouldRenderLabel =
    !LABELS_TO_HIDE.includes(label) &&
    !label.includes("value-") &&
    classNames?.indexOf("field-object") === -1 &&
    classNames?.indexOf("field-array") === -1;

  // Boolean fields - horizontal layout with switch on left
  if (schema.type === "boolean") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          {children}
          {shouldRenderLabel && label && (
            <label
              htmlFor={id}
              className="text-sm font-medium cursor-pointer"
            >
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
        {shouldRenderLabel && (
          <Label
            title={label}
            description={description}
            htmlFor={id}
            required={required}
            readOnly={readonly}
            disabled={disabled}
          />
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

  // Default field layout - vertical stack
  return (
    <div className="flex flex-col gap-1.5">
      {shouldRenderLabel && (
        <Label
          title={label}
          description={description}
          htmlFor={id}
          required={required}
          readOnly={readonly}
          disabled={disabled}
        />
      )}
      <div className="max-w-md">{children}</div>
    </div>
  );
}

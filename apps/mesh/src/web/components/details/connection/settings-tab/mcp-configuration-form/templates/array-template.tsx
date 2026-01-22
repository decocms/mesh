/**
 * Array Field Template
 *
 * Renders array fields with add/remove controls.
 * In RJSF v6, `items` are pre-rendered React elements.
 */

import type { ArrayFieldTemplateProps } from "@rjsf/utils";
import { getTemplate, getUiOptions, buttonId } from "@rjsf/utils";

export function CustomArrayFieldTemplate(props: ArrayFieldTemplateProps) {
  const { 
    canAdd, 
    disabled, 
    fieldPathId, 
    uiSchema, 
    items, 
    onAddClick, 
    readonly, 
    registry, 
    required,
    schema,
    title 
  } = props;

  const uiOptions = getUiOptions(uiSchema);
  
  // Get templates from registry
  const ArrayFieldDescriptionTemplate = getTemplate("ArrayFieldDescriptionTemplate", registry, uiOptions);
  const ArrayFieldTitleTemplate = getTemplate("ArrayFieldTitleTemplate", registry, uiOptions);
  const { ButtonTemplates: { AddButton } } = registry.templates;

  const hasItems = items && items.length > 0;

  return (
    <div className="space-y-2">
      {/* Title */}
      <ArrayFieldTitleTemplate
        fieldPathId={fieldPathId}
        title={uiOptions.title || title}
        schema={schema}
        uiSchema={uiSchema}
        required={required}
        registry={registry}
      />

      {/* Description */}
      <ArrayFieldDescriptionTemplate
        fieldPathId={fieldPathId}
        description={uiOptions.description || schema.description}
        schema={schema}
        uiSchema={uiSchema}
        registry={registry}
      />

      {/* Items container */}
      <div className="space-y-1">
        {!hasItems ? (
          <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">
            No items added yet
          </div>
        ) : (
          // Items are pre-rendered React elements in RJSF v6
          items
        )}
      </div>

      {/* Add button */}
      {canAdd && (
        <div className="mt-2">
          <AddButton
            id={buttonId(fieldPathId, "add")}
            className="rjsf-array-item-add w-full max-w-md"
            onClick={onAddClick}
            disabled={disabled || readonly}
            uiSchema={uiSchema}
            registry={registry}
          />
        </div>
      )}
    </div>
  );
}

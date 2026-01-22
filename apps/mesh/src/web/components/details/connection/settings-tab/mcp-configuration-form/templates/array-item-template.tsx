/**
 * Array Field Item Template
 *
 * Renders individual items in an array with input and remove button close together.
 */

import type { ArrayFieldItemTemplateProps } from "@rjsf/utils";
import { getTemplate, getUiOptions } from "@rjsf/utils";

export function CustomArrayFieldItemTemplate(props: ArrayFieldItemTemplateProps) {
  const { children, buttonsProps, hasToolbar, uiSchema, registry } = props;
  
  const uiOptions = getUiOptions(uiSchema);
  const ArrayFieldItemButtonsTemplate = getTemplate(
    "ArrayFieldItemButtonsTemplate",
    registry,
    uiOptions
  );

  return (
    <div className="flex items-center gap-2 mb-2">
      {/* Input field */}
      <div className="flex-1 max-w-md">{children}</div>
      
      {/* Remove button - close to input */}
      {hasToolbar && (
        <ArrayFieldItemButtonsTemplate {...buttonsProps} />
      )}
    </div>
  );
}


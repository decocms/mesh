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
    <div className="flex items-start gap-2 mb-2">
      {/* Input field */}
      <div className="flex-1 max-w-md">{children}</div>
      
      {/* Remove button - aligned with input top */}
      {hasToolbar && (
        <div className="pt-[22px]">
          <ArrayFieldItemButtonsTemplate {...buttonsProps} />
        </div>
      )}
    </div>
  );
}


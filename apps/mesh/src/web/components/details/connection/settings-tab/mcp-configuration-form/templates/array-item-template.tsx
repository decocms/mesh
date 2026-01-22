/**
 * Array Field Item Template
 *
 * Template for individual items within an array field.
 * Ensures each item has an editable input.
 */

import type { ArrayFieldTemplateItemType } from "@rjsf/utils";

export function CustomArrayFieldItemTemplate(props: ArrayFieldTemplateItemType) {
  const { children } = props;

  // Simply render the children (the input widget)
  return <div className="w-full">{children}</div>;
}


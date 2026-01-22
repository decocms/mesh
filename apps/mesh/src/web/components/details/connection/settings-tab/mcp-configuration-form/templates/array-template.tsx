/**
 * Array Field Template
 *
 * Renders array fields with add/remove controls.
 * Based on RJSF ArrayFieldTemplateProps.
 */

import type { ArrayFieldTemplateProps } from "@rjsf/utils";
import { Button } from "@deco/ui/components/button.tsx";
import { Plus } from "@untitledui/icons";
import { formatTitle } from "../utils";

export function CustomArrayFieldTemplate(props: ArrayFieldTemplateProps) {
  const { items, canAdd, onAddClick, title } = props;

  // Get item label for better UX
  const itemLabel = title ? formatTitle(title).replace(/s$/, "") : "Item";

  return (
    <div className="space-y-2">
      {/* Array items */}
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-3 text-center border border-dashed rounded-md">
            No items added yet
          </div>
        ) : (
          items.map((item) => (
            <div
              key={(item as unknown as { key?: string; index?: number }).key ?? (item as unknown as { index?: number }).index}
              className="flex gap-2 items-start"
            >
              <div className="flex-1">{item}</div>
            </div>
          ))
        )}
      </div>

      {/* Add button */}
      {canAdd && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddClick}
          className="w-full"
        >
          <Plus size={16} className="mr-2" />
          Add {itemLabel}
        </Button>
      )}
    </div>
  );
}
